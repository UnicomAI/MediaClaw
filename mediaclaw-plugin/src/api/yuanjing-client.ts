import WebSocket from "ws";
import {
  ApiResponse,
  VideoQueryResult,
  DigitalAvatarQueryResult,
  TextToSpeechData,
  VoiceTranscriptionQueryResult,
  SUPPORTED_SIZES,
  KlingT2VParams,
  KlingI2VParams,
  KlingTaskResult,
  KLING_MODELS,
  KLING_API_PATHS,
  YuanjingProviderConfig,
} from "./types.js";

const HTTP_REQUEST_TIMEOUT = 120000;
const HTTP_VIDEO_TIMEOUT = 60000;
const WS_REQUEST_TIMEOUT = 60000;

async function handleHttpError(response: Response): Promise<never> {
  let errorBody = "";
  try {
    errorBody = await response.text();
  } catch {
    // ignore
  }
  throw new Error(`HTTP ${response.status}: ${errorBody || response.statusText}`);
}

function rawDataToBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw.map((item) => rawDataToBuffer(item)));
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }
  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  return Buffer.from(String(raw), "utf8");
}

function tryParseJson(buffer: Buffer): unknown | null {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

function extractPcmFromWavChunk(buffer: Buffer): { pcm: Buffer | null; sampleRate?: number } {
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return { pcm: null };
  }

  const sampleRate = buffer.readUInt32LE(24);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > buffer.length) break;

    if (chunkId === "data") {
      return {
        pcm: buffer.subarray(dataStart, dataEnd),
        sampleRate,
      };
    }
    offset = dataEnd + (chunkSize % 2);
  }
  return { pcm: null, sampleRate };
}

function buildWavFromPcm(pcmBytes: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const fileSize = 36 + pcmBytes.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes.length, 40);
  return Buffer.concat([header, pcmBytes]);
}

export class YuanjingClient {
  private apiKey: string;
  private endpoint: string;

  constructor(config: YuanjingProviderConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.baseUrl || "https://maas-api.ai-yuanjing.com";
  }

  private get headers() {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  async textToImage(prompt: string, size: string, n: number, model: string): Promise<ApiResponse> {
    let resolution = size;
    if (resolution in SUPPORTED_SIZES) {
      resolution = SUPPORTED_SIZES[resolution] || size;
    }

    const url = `${this.endpoint}/openapi/v1/qwen_image/t2i`;
    const body = {
      model,
      prompt,
      n,
      size: resolution,
      response_format: "b64_json",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async imageQA(imageDataUrls: string[], prompt: string, mode: string): Promise<ApiResponse> {
    const systemPrompts: Record<string, string> = {
      storyboard: `你是专业的AI视频分镜导演。你的任务是接收用户提供的参考图片和"初始视频创意"，将其拆解为3个连贯的、专为图生视频API调用的分镜提示词�?
      
      单镜头公式：[锁定常量] + [动态变量（运动 + 运镜）]
      工作流程�?
      1. 提取与锁定常量：构建【主体】描述和【场景�?
      2. 设计动态变量：为三个分镜设计平滑递进的【运动】与【运镜�?
      3. 输出格式：纯净 JSON，{"镜头1": "...", "镜头2": "...", "镜头3": "..."}`,
            firstlast: `你是专业的AI视频分镜导演。你的任务是接收首帧参考图、尾帧参考图以及"初始视频创意"，将其拆解为3个连贯的分镜提示词�?

      核心原理：合理解释演�?- 深入分析首帧和尾帧之间的视觉差异，设计出合乎逻辑的，平滑的动作序列�?

      格式要求：纯净中文 JSON，{"镜头1": "...", "镜头2": "...", "镜头3": "..."}`,
    };

    const url = `${this.endpoint}/openapi/v1/yuanjingvl_plus/chat/completions`;
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (systemPrompts[mode]) {
      content.push({ type: "text", text: systemPrompts[mode] });
    }
    content.push({ type: "text", text: prompt });

    for (const dataUrl of imageDataUrls) {
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const body = {
      model: "YuanjingVL",
      messages: [{ role: "user", content }],
      stream: false,
      extra_body: { api_option: "general" },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async submitTextToVideo(prompt: string): Promise<ApiResponse> {
    const url = `${this.endpoint}/openapi/v1/wan_22/t2v/generate`;
    const body = { prompt };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async submitImageToVideo(imageBase64: string, style: string, prompt: string): Promise<ApiResponse> {
    const url = `${this.endpoint}/openapi/v1/yuanjing_img2styledvideo`;
    const body: Record<string, string> = { image: imageBase64, style };
    if (prompt) body.prompt = prompt;

    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async submitImagesToVideo(
    taskType: string,
    imagesBase64: string[],
    prompt: string
  ): Promise<ApiResponse> {
    const url = `${this.endpoint}/openapi/v1/yuanjing_imgs2video`;
    const body: Record<string, unknown> = { task_type: taskType, images: imagesBase64 };
    if (prompt) body.prompt = prompt;

    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async queryTextToVideoResult(resourceId: string): Promise<VideoQueryResult> {
    const url = `${this.endpoint}/openapi/v1/wan_22/t2v/get`;
    const body = { resourceId };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async queryImageToVideoResult(resourceId: string): Promise<VideoQueryResult> {
    const url = `${this.endpoint}/openapi/v1/yuanjing_img2styledvideo_get`;
    const body = { resourceId };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async queryImagesToVideoResult(resourceId: string): Promise<VideoQueryResult> {
    const url = `${this.endpoint}/openapi/v1/yuanjing_imgs2video_get`;
    const body = { resourceId };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async textToSpeech(
    text: string,
    speakerID: string = "baker",
    options?: {
      returnText?: number;
      paralang?: number;
      audioFormat?: string;
      sampleRate?: number;
      energy?: number;
      speed?: number;
    }
  ): Promise<ApiResponse<TextToSpeechData>> {
    const wsUrl = `${this.endpoint.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")}/openapi/api/tts/tts1`;

    const payload = {
      returnText: options?.returnText ?? 0,
      paralang: options?.paralang ?? 0,
      speakerID,
      text,
      audioFormat: options?.audioFormat ?? "wave",
      sampleRate: options?.sampleRate ?? 24000,
      energy: Number(options?.energy ?? 1.0),
      speed: Number(options?.speed ?? 1.0),
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      let sampleRate = payload.sampleRate;
      let audioFormat = payload.audioFormat;
      const rawBinaryChunks: Buffer[] = [];
      const pcmChunks: Buffer[] = [];
      let wavChunkSeen = false;

      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${this.apiKey || ""}`,
          "Content-Type": "application/json;charset=utf-8",
        },
        rejectUnauthorized: false,
      });

      const settleSuccess = (data: TextToSpeechData) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve({ code: 0, msg: "success", data });
      };

      const settleError = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error(message));
      };

      const timeout = setTimeout(() => {
        settleError("WebSocket timeout");
      }, WS_REQUEST_TIMEOUT);

      ws.on("open", () => {
        // Some backends validate float tokens strictly and reject integer tokens for energy/speed.
        const serialized = JSON.stringify(payload)
          .replace(/"energy":(\d+)([,\}])/g, "\"energy\":$1.0$2")
          .replace(/"speed":(\d+)([,\}])/g, "\"speed\":$1.0$2");
        ws.send(serialized);
      });

      ws.on("message", (raw) => {
        const buffer = rawDataToBuffer(raw);
        const parsed = tryParseJson(buffer) as
          | {
              code?: number;
              msg?: string;
              message?: string;
              finish?: number;
              done?: boolean;
              audio?: string;
              audioFormat?: string;
              sampleRate?: number;
              data?: { audio?: string; audioFormat?: string; sampleRate?: number };
            }
          | null;

        if (parsed) {
          if (typeof parsed.sampleRate === "number") {
            sampleRate = parsed.sampleRate;
          }
          if (typeof parsed.audioFormat === "string") {
            audioFormat = parsed.audioFormat;
          }
          if (typeof parsed.data?.sampleRate === "number") {
            sampleRate = parsed.data.sampleRate;
          }
          if (typeof parsed.data?.audioFormat === "string") {
            audioFormat = parsed.data.audioFormat;
          }

          if (typeof parsed.code === "number" && parsed.code !== 0) {
            settleError(`TTS error: ${parsed.msg || parsed.message || `code=${parsed.code}`}`);
            return;
          }

          const audioFromJson = parsed.data?.audio || parsed.audio;
          if (typeof audioFromJson === "string" && audioFromJson.length > 0) {
            settleSuccess({ audio: audioFromJson, audioFormat, sampleRate });
            return;
          }

          if (parsed.finish === 1 || parsed.done === true) {
            if (pcmChunks.length > 0) {
              settleSuccess({
                audio: buildWavFromPcm(Buffer.concat(pcmChunks), sampleRate || 24000),
                audioFormat: "wave",
                sampleRate,
              });
              return;
            }

            if (rawBinaryChunks.length > 0) {
              const joined = Buffer.concat(rawBinaryChunks);
              const isRiffWave = joined.length >= 12
                && joined.toString("ascii", 0, 4) === "RIFF"
                && joined.toString("ascii", 8, 12) === "WAVE";
              if (audioFormat === "wave" && !isRiffWave) {
                settleError("TTS returned non-WAV payload while audioFormat=wave");
                return;
              }
              settleSuccess({
                audio: joined,
                audioFormat,
                sampleRate,
              });
              return;
            }
            settleError("TTS finished but no audio payload was returned");
          }
          return;
        }

        if (typeof raw === "string") {
          const message = buffer.toString("utf8").trim();
          settleError(`TTS invalid message: ${message || "non-json text payload"}`);
          return;
        }

        if (buffer.length > 0) {
          const wav = extractPcmFromWavChunk(buffer);
          if (wav.pcm && wav.pcm.length > 0) {
            wavChunkSeen = true;
            if (wav.sampleRate && Number.isFinite(wav.sampleRate)) {
              sampleRate = wav.sampleRate;
            }
            pcmChunks.push(wav.pcm);
          } else {
            rawBinaryChunks.push(buffer);
            if (wavChunkSeen) {
              // If stream mixes wav chunks and raw chunks, treat raw as pcm continuation.
              pcmChunks.push(buffer);
            }
          }
        }
      });

      ws.on("error", (err) => {
        settleError(`WebSocket error: ${err instanceof Error ? err.message : String(err)}`);
      });

      ws.on("close", (code) => {
        if (settled) return;
        if (pcmChunks.length > 0) {
          settleSuccess({
            audio: buildWavFromPcm(Buffer.concat(pcmChunks), sampleRate || 24000),
            audioFormat: "wave",
            sampleRate,
          });
          return;
        }
        if (rawBinaryChunks.length > 0) {
          const joined = Buffer.concat(rawBinaryChunks);
          const isRiffWave = joined.length >= 12
            && joined.toString("ascii", 0, 4) === "RIFF"
            && joined.toString("ascii", 8, 12) === "WAVE";
          if (audioFormat === "wave" && !isRiffWave) {
            settleError("TTS returned non-WAV payload while audioFormat=wave");
            return;
          }
          settleSuccess({
            audio: joined,
            audioFormat,
            sampleRate,
          });
          return;
        }
        settleError(`WebSocket closed unexpectedly (code: ${code})`);
      });
    });
  }

  async voiceFileTranscription(
    audioBuffer: Buffer,
    audioFilename: string,
    config: Record<string, unknown>
  ): Promise<ApiResponse> {
    const url = `${this.endpoint}/openapi/unicom/prod/file/asr`;

    const form = new FormData();
    const nestedConfig = { config };
    form.append("config", JSON.stringify(nestedConfig));
    form.append("file", new Blob([audioBuffer], { type: "application/octet-stream" }), audioFilename);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

        return response.json();
  }

  /**
   * 查询语音转录结果
   * @param sessionId 会话ID（提交任务时返回的uuid�?
   */
  async queryVoiceTranscriptionResult(sessionId: string): Promise<VoiceTranscriptionQueryResult> {
    const url = `${this.endpoint}/openapi/unicom/download`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ session_id: sessionId }),
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  /**
   * 检查语音转录是否完�?
   */
  isVoiceTranscriptionCompleted(result: VoiceTranscriptionQueryResult): boolean {
    return result.is_effective === true || result.asr_result != null;
  }

  /**
   * 检查语音转录是否处理中
   */
  isVoiceTranscriptionProcessing(result: VoiceTranscriptionQueryResult): boolean {
    return result.is_effective === false && result.asr_result == null;
  }

  /**
   * 从语音转录结果中提取转录文本
   */
  extractVoiceTranscriptionText(result: VoiceTranscriptionQueryResult): string {
    // asr_result 可能�?JSON 字符串或已解析的对象
    let asrResult = result.asr_result;
    if (typeof asrResult === 'string') {
      try {
        asrResult = JSON.parse(asrResult);
      } catch {
        return asrResult; // 解析失败，直接返回原始字符串
      }
    }

    if (!asrResult) {
      return "";
    }

    // 元景 ASR 格式: [{ start, end, speaker, text, trans }]
    if (Array.isArray(asrResult)) {
      return asrResult
        .map((segment: any) => {
          const parts: string[] = [];
          const start = typeof segment.start === 'number' ? segment.start.toFixed(2) : '';
          const end = typeof segment.end === 'number' ? segment.end.toFixed(2) : '';
          const speaker = segment.speaker != null ? segment.speaker : '';
          const text = segment.text || '';
          const trans = segment.trans || '';

          // 格式: [start-end] Speaker N: text (trans)
          const timeTag = start && end ? `[${start}-${end}]` : '';
          const speakerTag = speaker !== '' ? `S${speaker}` : '';
          const prefix = [timeTag, speakerTag].filter(Boolean).join(' ');
          
          let content = text;
          if (trans && trans !== text) {
            content = `${text} (${trans})`;
          }
          
          return prefix ? `${prefix} ${content}` : content;
        })
        .filter(Boolean)
        .join('\n');
    }

    // 兼容旧格�? { diarization: [...] }
    if (typeof asrResult === 'object' && Array.isArray(asrResult.diarization)) {
      return asrResult.diarization
        .map((segment: any) => {
          const parts: string[] = [];
          if (segment.speaker != null) {
            parts.push(`Speaker ${segment.speaker}:`);
          }
          if (typeof segment.text === 'string' && segment.text.trim().length > 0) {
            parts.push(segment.text.trim());
          } else if (typeof segment.trans === 'string' && segment.trans.trim().length > 0) {
            parts.push(segment.trans.trim());
          }
          return parts.join(' ');
        })
        .filter(Boolean)
        .join('\n');
    }

    if (typeof asrResult === 'string') {
      return asrResult;
    }

    return JSON.stringify(asrResult, null, 2);
  }


  async submitDigitalAvatar(
    audioBase64: string,
    avatarId: string,
    actionId: string,
    timestamp: string,
    text?: string
  ): Promise<ApiResponse> {
    const url = `${this.endpoint}/openapi/v1/yuanjing_digital_avatar_audio/generate`;
    const body: Record<string, unknown> = {
      audio: audioBase64,
      avatar_id: avatarId,
      action_id: actionId,
      timestamp,
    };
    if (text) {
      body.text = text;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  async queryDigitalAvatarResult(resourceId: string): Promise<DigitalAvatarQueryResult> {
    const url = `${this.endpoint}/openapi/v1/yuanjing_digital_avatar_audio/get`;
    const body = { resourceId };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  isDigitalAvatarCompleted(result: DigitalAvatarQueryResult): boolean {
    const status = result.result?.status?.toLowerCase();
    return status === "done" || status === "completed" || status === "success";
  }

  isDigitalAvatarProcessing(result: DigitalAvatarQueryResult): boolean {
    const status = result.result?.status?.toLowerCase();
    return status === "building" || status === "pending" || status === "processing";
  }

  isDigitalAvatarFailed(result: DigitalAvatarQueryResult): boolean {
    const status = result.result?.status?.toLowerCase();
    return status === "failed" || status === "error";
  }

  extractDigitalAvatarVideo(result: DigitalAvatarQueryResult): string {
    return result.result?.video || "";
  }

  extractDigitalAvatarSubtitle(result: DigitalAvatarQueryResult): string {
    return result.result?.subtitle || "";
  }

  extractVideoBase64(result: VideoQueryResult): string {
    if (result.data?.video) return result.data.video;
    if (result.result?.video) return result.result.video;
    if ((result as any).video) return (result as any).video;
    return "";
  }

  isVideoCompleted(result: VideoQueryResult): boolean {
    if (result.code === 0) return true;
    if (result.code === 1) return false;
    if (result.code === 2) throw new Error(`任务失败: ${result.msg}`);
    return false;
  }

  isVideoProcessing(result: VideoQueryResult): boolean {
    const msg = result.msg?.toLowerCase() || "";
    return result.code === 1 || msg.includes("generating") || msg.includes("processing");
  }

  // ============================================================================
  // Kling Video Generation API
  // ============================================================================

  /**
   * 提交 Kling 文生视频任务
   */
  async submitKlingTextToVideo(params: KlingT2VParams): Promise<ApiResponse> {
    const url = `${this.endpoint}${KLING_API_PATHS.EXECUTE}?model=${params.model_name || KLING_MODELS.T2V}`;
    const body = {
      model_name: params.model_name || KLING_MODELS.T2V,
      prompt: params.prompt,
      negative_prompt: params.negative_prompt || "",
      sound: params.sound || "off",
      cfg_scale: params.cfg_scale ?? 0.5,
      mode: params.mode || "std",
      aspect_ratio: params.aspect_ratio || "16:9",
      duration: params.duration || "5",
      ...(params.camera_control && { camera_control: params.camera_control }),
      ...(params.watermark_info && { watermark_info: params.watermark_info }),
      ...(params.callback_url && { callback_url: params.callback_url }),
      ...(params.external_task_id && { external_task_id: params.external_task_id }),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  /**
   * 提交 Kling 图生视频任务
   */
  async submitKlingImageToVideo(params: KlingI2VParams): Promise<ApiResponse> {
    const url = `${this.endpoint}${KLING_API_PATHS.EXECUTE}?model=${params.model_name || KLING_MODELS.I2V}`;
    const body: Record<string, unknown> = {
      model_name: params.model_name || KLING_MODELS.I2V,
      mode: params.mode || "std",
      duration: params.duration || "5",
      ...(params.image && { image: params.image }),
      ...(params.image_tail && { image_tail: params.image_tail }),
      ...(params.prompt && { prompt: params.prompt }),
      ...(params.negative_prompt && { negative_prompt: params.negative_prompt }),
      ...(params.voice_list && { voice_list: params.voice_list }),
      ...(params.sound && { sound: params.sound }),
      ...(params.cfg_scale !== undefined && { cfg_scale: params.cfg_scale }),
      ...(params.static_mask && { static_mask: params.static_mask }),
      ...(params.dynamic_masks && { dynamic_masks: params.dynamic_masks }),
      ...(params.camera_control && { camera_control: params.camera_control }),
      ...(params.watermark_info && { watermark_info: params.watermark_info }),
      ...(params.callback_url && { callback_url: params.callback_url }),
      ...(params.external_task_id && { external_task_id: params.external_task_id }),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  /**
   * 查询 Kling 任务结果
   */
  async queryKlingTaskResult(modelId: string, taskId: string): Promise<KlingTaskResult> {
    const url = new URL(`${this.endpoint}${KLING_API_PATHS.TASKS}`);
    url.searchParams.set("model_id", modelId);
    url.searchParams.set("task_id", taskId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.json();
  }

  /**
   * 检�?Kling 任务是否完成
   */
  isKlingTaskCompleted(result: KlingTaskResult): boolean {
    const status = result.data?.task_status?.toLowerCase();
    return status === "succeed";
  }

  /**
   * 检�?Kling 任务是否处理�?
   */
  isKlingTaskProcessing(result: KlingTaskResult): boolean {
    const status = result.data?.task_status?.toLowerCase();
    return status === "submitted" || status === "processing";
  }

  /**
   * 检�?Kling 任务是否失败
   */
  isKlingTaskFailed(result: KlingTaskResult): boolean {
    const status = result.data?.task_status?.toLowerCase();
    return status === "failed";
  }

  /**
   * �?Kling 任务结果中提取视�?URL
   */
  extractKlingVideoUrl(result: KlingTaskResult): string {
    return result.data?.task_result?.videos?.[0]?.url || "";
  }

  /**
   * �?Kling 任务结果中提取视频（下载并转换为 base64�?
   */
  async extractKlingVideoBase64(result: KlingTaskResult): Promise<string> {
    const url = this.extractKlingVideoUrl(result);
    if (!url) return "";

    const response = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  /**
   * 下载 Kling 视频内容
   */
  async downloadKlingVideoContent(result: KlingTaskResult): Promise<ArrayBuffer> {
    const url = this.extractKlingVideoUrl(result);
    if (!url) {
      throw new Error("No video URL found in Kling task result");
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    return response.arrayBuffer();
  }
}
