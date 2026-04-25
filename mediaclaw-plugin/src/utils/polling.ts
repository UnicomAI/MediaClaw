import { VideoQueryResult } from "../api/types.js";

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface VideoPollOptions<T = VideoQueryResult> {
  pollFn: () => Promise<T>;
  extractVideoBase64?: ((result: T) => string) | ((result: T) => Promise<string>);
  isCompleted?: (result: T) => boolean;
  isProcessing?: (result: T) => boolean;
  isFailed?: (result: T) => boolean;
  getStatusMessage?: (result: T) => string;
  pollInterval: number;
  maxWaitTime: number;
  logPrefix: string;
  onDownload?: () => Promise<string | null>;
}

export interface VideoPollResult {
  videoBase64?: string;
  videoPath?: string;
  error?: Error;
  timeout: boolean;
  resourceId: string;
  lastStatus: string;
}

/**
 * 通用视频轮询函数 - 支持 Wan 和 Kling 两种格式
 */
export async function pollVideoResult<T = VideoQueryResult>(options: VideoPollOptions<T>): Promise<VideoPollResult> {
  const {
    pollFn,
    extractVideoBase64,
    isCompleted,
    isProcessing,
    isFailed,
    getStatusMessage,
    pollInterval,
    maxWaitTime,
    logPrefix,
    onDownload,
  } = options;

  const startTime = Date.now();
  let lastStatus = "";

  // 默认使用 Wan 格式的判断函数
  const defaultIsCompleted = (result: T) => {
    const r = result as unknown as VideoQueryResult;
    return r.code === 0;
  };

  const defaultIsProcessing = (result: T) => {
    const r = result as unknown as VideoQueryResult;
    const msg = r.msg?.toLowerCase() || "";
    return r.code === 1 || msg.includes("generating") || msg.includes("processing") || msg.includes("pending");
  };

  const defaultIsFailed = (result: T) => {
    const r = result as unknown as VideoQueryResult;
    return r.code === 2;
  };

  const defaultGetStatusMessage = (result: T) => {
    const r = result as unknown as VideoQueryResult;
    return `code=${r.code}, msg=${r.msg}`;
  };

  const defaultExtractVideoBase64 = (result: T) => {
    const r = result as unknown as VideoQueryResult;
    if (r.data?.video) return r.data.video;
    if (r.result?.video) return r.result.video;
    if ((r as any).video) return (r as any).video;
    return "";
  };

  const checkCompleted = isCompleted || defaultIsCompleted;
  const checkProcessing = isProcessing || defaultIsProcessing;
  const checkFailed = isFailed || defaultIsFailed;
  const getMessage = getStatusMessage || defaultGetStatusMessage;
  const extractB64 = extractVideoBase64 || defaultExtractVideoBase64;

  while (Date.now() - startTime < maxWaitTime) {
    await sleep(pollInterval);

    const result = await pollFn();
    lastStatus = getMessage(result);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`[MediaClaw] ${logPrefix}轮询中... (${elapsed}秒) 状态: ${lastStatus}`);

    if (checkFailed(result)) {
      return { error: new Error(`任务失败: ${lastStatus}`), timeout: false, resourceId: "", lastStatus };
    }

    if (checkCompleted(result)) {
      // Try download callback first (for SGLang/Kling direct download)
      if (onDownload) {
        try {
          const videoPath = await onDownload();
          if (videoPath) {
            return { videoPath, timeout: false, resourceId: "", lastStatus };
          }
        } catch (err) {
          console.log(`[MediaClaw] 下载视频失败，尝试 base64: ${err}`);
        }
      }

      // Try extract base64
      const videoB64 = await Promise.resolve(extractB64(result));
      if (videoB64) {
        return { videoBase64: videoB64, timeout: false, resourceId: "", lastStatus };
      }

      continue;
    }

    if (!checkProcessing(result)) {
      console.log(`[MediaClaw] ${logPrefix}未知状态: ${lastStatus}, 继续等待`);
    }
  }

  return { timeout: true, resourceId: "", lastStatus };
}

export async function pollWithTimeout<T>(
  pollFn: () => Promise<T>,
  isDoneFn: (result: T) => boolean,
  isErrorFn: (result: T) => Error | null,
  intervalMs: number,
  maxWaitMs: number
): Promise<{ result?: T; error?: Error; timeout: boolean }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await pollFn();
    const error = isErrorFn(result);
    if (error) {
      return { error, timeout: false };
    }
    if (isDoneFn(result)) {
      return { result, timeout: false };
    }
    await sleep(intervalMs);
  }

  return { timeout: true };
}