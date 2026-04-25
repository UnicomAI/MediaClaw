import { ApiResponse, VideoQueryResult, SGLangProviderConfig } from "./types.js";

const HTTP_REQUEST_TIMEOUT = 120000;
const HTTP_VIDEO_TIMEOUT = 60000;
const SGLANG_VISION_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";

async function handleHttpError(response: Response, context: string): Promise<never> {
  let errorBody = "";
  try {
    errorBody = await response.text();
  } catch {
    // ignore
  }
  throw new Error(`${context}: HTTP ${response.status}${errorBody ? ` - ${errorBody}` : ""}`);
}

function parseImageBase64(imageBase64: string): { bytes: Buffer; mimeType: string; fileName: string } {
  const trimmed = imageBase64.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);

  const mimeType = (match?.[1] || "image/png").toLowerCase();
  const base64Payload = (match?.[2] || trimmed).replace(/\s+/g, "");
  const bytes = Buffer.from(base64Payload, "base64");

  if (bytes.length === 0) {
    throw new Error("SGLang image-to-video failed: input image is empty or invalid base64");
  }

  const extension = mimeType.includes("jpeg")
    ? "jpg"
    : mimeType.includes("webp")
      ? "webp"
      : mimeType.includes("gif")
        ? "gif"
        : "png";

  return { bytes, mimeType, fileName: `input_reference.${extension}` };
}

export class SGLangClient {
  private baseUrl: string;
  private apiKey: string;
  private apiPath: string;
  private listVideosUnsupported: boolean;

  constructor(config: SGLangProviderConfig) {
    this.baseUrl = config.baseUrl || "http://localhost:30010";
    this.apiKey = config.apiKey || "sk-dummy";
    this.apiPath = config.apiPath || "";
    this.listVideosUnsupported = false;
    console.log(`[MediaClaw] SGLang init baseUrl=${this.baseUrl}, apiPath=${this.apiPath}`);
  }

  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private get headers() {
    return {
      ...this.authHeaders,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}${this.apiPath}${endpoint}`;
  }

  async textToImage(prompt: string, size: string, n: number, _model?: string): Promise<ApiResponse> {
    const url = this.buildUrl("/images/generations");
    const body = {
      prompt,
      size,
      n,
      response_format: "b64_json",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response, "SGLang image generation failed");
    }

    const result = await response.json();
    return {
      code: 0,
      msg: "success",
      data: result.data || [],
    };
  }

  async imageQA(imageDataUrls: string[], prompt: string, mode: string): Promise<ApiResponse> {
    const url = this.buildUrl("/chat/completions");
    const normalizedMode = (mode || "general").trim().toLowerCase();
    const modePrefix = normalizedMode === "general" ? "" : `[mode=${normalizedMode}] `;
    const model = SGLANG_VISION_MODEL;

    const content: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: `${modePrefix}${prompt}` },
    ];
    for (const imageUrl of imageDataUrls) {
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    const body = {
      model,
      messages: [{ role: "user", content }],
      stream: false,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response, "SGLang vision chat failed");
    }

    const result = await response.json();
    return result as ApiResponse;
  }

  async submitTextToVideo(prompt: string): Promise<ApiResponse> {
    const url = this.buildUrl("/videos");
    const body = {
      prompt,
      size: "1280x720",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response, "SGLang video submission failed");
    }

    const result = await response.json();
    return {
      code: 0,
      msg: "success",
      resource_id: result.id,
      data: { status: result.status || "pending" },
    };
  }

  async submitImageToVideo(imageBase64: string, style: string, prompt: string): Promise<ApiResponse> {
    const url = this.buildUrl("/videos");
    const { bytes, mimeType, fileName } = parseImageBase64(imageBase64);

    const form = new FormData();
    const normalizedPrompt = (prompt || "").trim();
    const normalizedStyle = (style || "").trim();
    const imageBytes = new Uint8Array(bytes);
    form.append("prompt", normalizedPrompt || normalizedStyle || "image to video");
    form.append("size", "1280x720");
    form.append("input_reference", new Blob([imageBytes], { type: mimeType }), fileName);

    const response = await fetch(url, {
      method: "POST",
      headers: this.authHeaders,
      body: form,
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      await handleHttpError(response, "SGLang image-to-video submission failed");
    }

    const result = await response.json();
    const resourceId = result.id || result.resource_id || result.resourceId;
    if (!resourceId) {
      return {
        code: 1,
        msg: "SGLang image-to-video response missing id",
        data: result,
      };
    }

    return {
      code: 0,
      msg: "success",
      resource_id: resourceId,
      data: { status: result.status || "pending" },
    };
  }

  async submitImagesToVideo(_taskType: string, _imagesBase64: string[], _prompt: string): Promise<ApiResponse> {
    return {
      code: 1,
      msg: "SGLang interface does not support images-to-video yet. Please use interface=yuanjing.",
    };
  }

  async queryTextToVideoResult(resourceId: string): Promise<VideoQueryResult> {
    if (this.listVideosUnsupported) {
      // Some proxy/gateway deployments only allow POST /videos, but not GET /videos.
      // In this mode we rely on /videos/{id}/content download probing in pollVideoResult.
      return { code: 0, msg: "download_probe", data: { status: "processing" } };
    }

    const url = this.buildUrl("/videos");

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT),
    });

    if (!response.ok) {
      if (response.status === 405) {
        this.listVideosUnsupported = true;
        console.warn("[SGLang] GET /videos returned 405, switch to download-probe polling mode");
        return { code: 0, msg: "download_probe", data: { status: "processing" } };
      }
      await handleHttpError(response, "SGLang video status query failed");
    }

    const result = await response.json();
    const items: Array<{ id: string; status?: string; error?: string }> = result.data || [];
    const video = items.find((v) => v.id === resourceId);

    if (!video) {
      return { code: 1, msg: "processing" };
    }

    const status = video.status?.toLowerCase() || "";

    if (status === "completed") {
      return { code: 0, msg: "success", data: { status: "completed" } };
    }
    if (status === "failed" || status === "error") {
      return { code: 2, msg: video.error || "failed" };
    }

    return { code: 1, msg: status || "processing" };
  }

  async queryImageToVideoResult(resourceId: string): Promise<VideoQueryResult> {
    return this.queryTextToVideoResult(resourceId);
  }

  async queryImagesToVideoResult(_resourceId: string): Promise<VideoQueryResult> {
    return {
      code: 1,
      msg: "SGLang interface does not support images-to-video yet. Please use interface=yuanjing.",
    };
  }

  async downloadVideoContent(videoId: string): Promise<ArrayBuffer> {
    const url = this.buildUrl(`/videos/${videoId}/content`);

    const response = await fetch(url, {
      method: "GET",
      headers: this.authHeaders,
      signal: AbortSignal.timeout(HTTP_VIDEO_TIMEOUT * 10),
    });

    if (!response.ok) {
      await handleHttpError(response, "SGLang video download failed");
    }

    return response.arrayBuffer();
  }

  extractVideoBase64(_result: VideoQueryResult): string {
    return "";
  }

  isVideoCompleted(result: VideoQueryResult): boolean {
    return result.code === 0;
  }

  isVideoProcessing(result: VideoQueryResult): boolean {
    return result.code === 1 || result.msg === "processing" || result.msg === "pending";
  }
}
