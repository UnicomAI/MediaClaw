import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { Type } from "@sinclair/typebox";
import { ToolResult, CAPABILITY_SUPPORT } from "../api/types.js";
import { ClientManager, YuanjingClient } from "../api/index.js";

const POLL_INTERVAL_MS = 3000; // 3 seconds
const MAX_POLL_TIME_MS = 300000; // 5 minutes

function normalizeInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
  }
  return undefined;
}

function parseAsrResult(asrResult: unknown): unknown {
  if (typeof asrResult === "string") {
    try {
      return JSON.parse(asrResult);
    } catch {
      return asrResult;
    }
  }
  return asrResult;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function registerSpeechRecognition(
  manager: ClientManager,
  pollInterval: number = POLL_INTERVAL_MS,
  maxPollTime: number = MAX_POLL_TIME_MS
) {
  return {
    name: "mediaclaw_speech_recognition",
    description: "Speech recognition for local audio files using Yuanjing async file transcription API. 注意：仅支持 yuanjing 接口。异步模式，提交任务后轮询获取结果。",
    parameters: Type.Object({
      file: Type.String({ description: "Local path of the input audio file." }),
      session_id: Type.Optional(Type.String({ description: "Session UUID. Default generated automatically." })),
      add_punc: Type.Optional(Type.Integer({ description: "Add punctuation switch, 0 or 1.", default: 1, enum: [0, 1] })),
      itn_switch: Type.Optional(Type.Integer({ description: "Inverse text normalization switch, 0 or 1.", default: 0, enum: [0, 1] })),
      vad_switch: Type.Optional(Type.Integer({ description: "Voice activity detection switch, 0 or 1.", default: 1, enum: [0, 1] })),
      diarization: Type.Optional(Type.Integer({ description: "Speaker diarization switch, 0 or 1.", default: 0, enum: [0, 1] })),
      spk_num: Type.Optional(Type.Integer({ description: "Known speaker count to improve diarization accuracy." })),
      diarization_mode: Type.Optional(Type.Integer({ description: "Diarization mode: 0, 1 or 2.", default: 0, enum: [0, 1, 2] })),
      max_end_sil: Type.Optional(Type.Integer({ description: "End silence threshold in ms.", default: 800 })),
      max_single_seg: Type.Optional(Type.Integer({ description: "Maximum single segment length in ms.", default: 30000 })),
      speech_noise_thres: Type.Optional(Type.Number({ description: "Speech/noise threshold [0,1].", default: 0.6, minimum: 0, maximum: 1 })),
    }),
    async execute(_id: string, params: {
      file: string;
      session_id?: string;
      diarization?:  0 | 1;
      add_punc?:  0 | 1;
      itn_switch?: 0 | 1;
      vad_switch?:  0 | 1;
      spk_num?: number;
      diarization_mode?:  0 | 1 | 2;
      max_end_sil?: number;
      max_single_seg?: number;
      speech_noise_thres?: number;
    }): Promise<ToolResult> {
      if (!manager.hasProvider("yuanjing")) {
        const supported = CAPABILITY_SUPPORT.textToSpeech.join(", ");
        throw new Error(
          `语音识别功能需要配置 yuanjing 提供商。支持的提供商: ${supported}\n` +
          `请在配置中添加 providers.yuanjing 配置项。`
        );
      }

      const client = manager.getYuanjingClient();
      if (!(client instanceof YuanjingClient)) {
        throw new Error("Speech recognition is only available for provider=yuanjing.");
      }

      const audioPath = params.file;
      if (!audioPath || !fs.existsSync(audioPath)) {
        throw new Error(`Audio file does not exist: ${audioPath}`);
      }

      const sessionId = params.session_id || randomUUID();
      const config: Record<string, unknown> = {
        session_id: sessionId,
        diarization: normalizeInteger(params.diarization) ?? 0,
        add_punc: normalizeInteger(params.add_punc) ?? 1,
        itn_switch: normalizeInteger(params.itn_switch) ?? 0,
        vad_switch: normalizeInteger(params.vad_switch) ?? 1,
      };

      if (params.spk_num !== undefined) {
        config.spk_num = normalizeInteger(params.spk_num);
      }
      if (params.diarization_mode !== undefined) {
        config.diarization_mode = normalizeInteger(params.diarization_mode);
      }
      if (params.max_end_sil !== undefined) {
        config.max_end_sil = normalizeInteger(params.max_end_sil);
      }
      if (params.max_single_seg !== undefined) {
        config.max_single_seg = normalizeInteger(params.max_single_seg);
      }
      if (params.speech_noise_thres !== undefined) {
        config.speech_noise_thres = params.speech_noise_thres;
      }

      // 提交异步任务
      const fileBuffer = fs.readFileSync(audioPath);
      const submitResponse = await client.voiceFileTranscription(fileBuffer, path.basename(audioPath), config);
      const rawSubmitResponse = submitResponse as unknown as { status?: string; uuid?: string; code: number; msg: string };

      if (rawSubmitResponse.status === "error" || rawSubmitResponse.code !== 0) {
        throw new Error(`Speech recognition submit failed: ${rawSubmitResponse.msg || `code=${rawSubmitResponse.code}`}`);
      }

      const uuid = rawSubmitResponse.uuid || sessionId;

      // 轮询获取结果
      const startTime = Date.now();
      while (Date.now() - startTime < maxPollTime) {
        const queryResult = await client.queryVoiceTranscriptionResult(uuid);

        if (client.isVoiceTranscriptionCompleted(queryResult)) {
          const text = client.extractVoiceTranscriptionText(queryResult);
          
          // 获取输出目录配置
          const config = manager.getConfig();
          const outputDir = config.outputDir || path.join(path.dirname(audioPath), "speech_recognition_results");
          
          // 确保输出目录存在
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          // 构建完整的结果JSON对象
          const resultFileName = `${path.basename(audioPath, path.extname(audioPath))}_${uuid}.json`;
          const resultFilePath = path.join(outputDir, resultFileName);
          const parsedAsrResult = parseAsrResult(queryResult.asr_result);
          
          const fullResult = {
            session_id: uuid,
            audio_file: audioPath,
            timestamp: new Date().toISOString(),
            transcription_text: text || "(no transcription result)",
            asr_result: parsedAsrResult,
            title: queryResult.title,
            user_id: queryResult.user_id,
            created_at: queryResult.created_at,
            updated_at: queryResult.updated_at,
          };
          
          // 保存为JSON文件
          fs.writeFileSync(resultFilePath, JSON.stringify(fullResult, null, 2), 'utf-8');
          
          return {
            content: [
              {
                type: "text",
                text: `Speech recognition completed.\nsession_id: ${uuid}\nResult saved to: ${resultFilePath}\n\n${text || "(no transcription result)"}`,
              },
            ],
          };
        }

        if (!client.isVoiceTranscriptionProcessing(queryResult)) {
          throw new Error(`Speech recognition failed or returned invalid result.`);
        }

        await sleep(pollInterval);
      }

      throw new Error(`Speech recognition timed out after ${maxPollTime / 1000} seconds. session_id: ${uuid}`);
    },
  };
}
