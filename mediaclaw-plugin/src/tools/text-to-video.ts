import { Type } from "@sinclair/typebox";
import {
  ToolResult,
  extractResourceId,
  KLING_MODELS,
  KlingMode,
  KlingDuration,
  KlingAspectRatio,
  KlingSound,
} from "../api/types.js";
import { ClientManager, SGLangClient, YuanjingClient } from "../api/index.js";
import { pollVideoResult } from "../utils/polling.js";
import { saveBase64Video, generateVideoOutputPath, saveArrayBufferVideo } from "../utils/file.js";

export function registerTextToVideo(
  manager: ClientManager,
  outputDir?: string,
  pollInterval: number = 5000,
  maxWaitTime: number = 300000
) {
  return {
    name: "mediaclaw_text_to_video",
    description: "文生视频 - 使用 Wan 2.2 或 Kling（yuanjing）或对应模型（sglang）生成视频。可通过配置选择 wan/kling 模型，内部自动轮询，无需手动查询结果。",
    parameters: Type.Object({
      prompt: Type.String({ description: "视频描述文本（必填）" }),
      model: Type.Optional(Type.String({
        description: "视频生成模型（可选，覆盖配置文件设置）：wan（Wan 2.2）或 kling（Kling V3）",
        enum: ["wan", "kling"],
      })),
      // Kling 专用参数
      mode: Type.Optional(Type.String({
        description: "Kling 生成模式（仅 kling 模型有效）：std（标准模式，性价比高）或 pro（专家模式，高品质）",
        enum: ["std", "pro"],
      })),
      duration: Type.Optional(Type.String({
        description: "Kling 视频时长（仅 kling 模型有效）：5 或 10 秒",
        enum: ["5", "10"],
      })),
      aspect_ratio: Type.Optional(Type.String({
        description: "Kling 视频纵横比（仅 kling 模型有效）：16:9、9:16 或 1:1",
        enum: ["16:9", "9:16", "1:1"],
      })),
      negative_prompt: Type.Optional(Type.String({
        description: "Kling 负向提示词（仅 kling 模型有效）",
      })),
      sound: Type.Optional(Type.String({
        description: "Kling 是否生成声音（仅 kling 模型有效）：on 或 off",
        enum: ["on", "off"],
      })),
      cfg_scale: Type.Optional(Type.Number({
        description: "Kling 生成自由度（仅 kling 模型有效）：取值范围 [0, 1]，值越大越贴近提示词",
      })),
      output_dir: Type.Optional(Type.String({ description: "输出目录路径" })),
    }),
    async execute(_id: string, params: {
      prompt: string;
      model?: "wan" | "kling";
      mode?: KlingMode;
      duration?: KlingDuration;
      aspect_ratio?: KlingAspectRatio;
      negative_prompt?: string;
      sound?: KlingSound;
      cfg_scale?: number;
      output_dir?: string;
    }): Promise<ToolResult> {
      const prompt = params.prompt;
      const outDir = params.output_dir || outputDir;

      // 动态获取客户端
      const client = manager.getClient("textToVideo");

      // 确定使用的模型：参数优先，否则使用配置
      const videoModel = params.model || (manager.getVideoModel("textToVideo"));

      // SGLang 客户端始终使用原有方式
      if (client instanceof SGLangClient) {
        return executeWanTextToVideo(client, prompt, outDir, pollInterval, maxWaitTime);
      }

      // Yuanjing 客户端根据模型选择
      if (client instanceof YuanjingClient) {
        if (videoModel === "kling") {
          return executeKlingTextToVideo(
            client,
            prompt,
            outDir,
            pollInterval,
            maxWaitTime,
            params
          );
        }
        // 默认使用 wan
        return executeWanTextToVideo(client, prompt, outDir, pollInterval, maxWaitTime);
      }

      // 其他客户端类型，默认使用 wan 方式
      return executeWanTextToVideo(client as any, prompt, outDir, pollInterval, maxWaitTime);
    },
  };
}

/**
 * 执行 Wan 文生视频
 */
async function executeWanTextToVideo(
  client: any,
  prompt: string,
  outDir: string | undefined,
  pollInterval: number,
  maxWaitTime: number
): Promise<ToolResult> {
  const submitResponse = await client.submitTextToVideo(prompt);

  if (submitResponse.code !== 0) {
    throw new Error(`提交任务失败: ${submitResponse.msg}`);
  }

  const resourceId = extractResourceId(submitResponse);
  if (!resourceId) {
    throw new Error("未返回 resource_id");
  }

  const pollResult = await pollVideoResult({
    pollFn: () => client.queryTextToVideoResult(resourceId),
    extractVideoBase64: (result) => client.extractVideoBase64(result),
    pollInterval,
    maxWaitTime,
    logPrefix: "文生视频(Wan)",
    onDownload: client instanceof SGLangClient
      ? async () => {
          const videoBytes = await (client as SGLangClient).downloadVideoContent(resourceId);
          const outputPath = generateVideoOutputPath(prompt, "mediaclaw_t2v", outDir);
          saveArrayBufferVideo(videoBytes, outputPath);
          return outputPath;
        }
      : undefined,
  });

  if (pollResult.error) {
    throw pollResult.error;
  }

  if (pollResult.timeout) {
    return {
      content: [{
        type: "text",
        text: `视频生成超时（${Math.round(maxWaitTime / 1000)}秒）\nresource_id: ${resourceId}\n最后状态: ${pollResult.lastStatus}`,
      }],
    };
  }

  let outputPath: string;
  if (pollResult.videoPath) {
    outputPath = pollResult.videoPath;
  } else if (pollResult.videoBase64) {
    outputPath = generateVideoOutputPath(prompt, "mediaclaw_t2v", outDir);
    saveBase64Video(pollResult.videoBase64, outputPath);
  } else {
    throw new Error("视频生成完成但未返回视频数据");
  }

  console.log(`[MediaClaw] 文生视频(Wan)完成！输出: ${outputPath}`);
  return {
    content: [{ type: "text", text: `文生视频(Wan)完成！\n输出文件: ${outputPath}` }],
  };
}

/**
 * 执行 Kling 文生视频
 */
async function executeKlingTextToVideo(
  client: YuanjingClient,
  prompt: string,
  outDir: string | undefined,
  pollInterval: number,
  maxWaitTime: number,
  params: {
    mode?: KlingMode;
    duration?: KlingDuration;
    aspect_ratio?: KlingAspectRatio;
    negative_prompt?: string;
    sound?: KlingSound;
    cfg_scale?: number;
  }
): Promise<ToolResult> {
  const submitResponse = await client.submitKlingTextToVideo({
    prompt,
    mode: params.mode,
    duration: params.duration,
    aspect_ratio: params.aspect_ratio,
    negative_prompt: params.negative_prompt,
    sound: params.sound,
    cfg_scale: params.cfg_scale,
  });

  if (submitResponse.code !== 0) {
    throw new Error(`提交 Kling 任务失败: ${submitResponse.msg}`);
  }

  const taskId = extractResourceId(submitResponse) || (submitResponse as any).data?.task_id;
  if (!taskId) {
    throw new Error("未返回 task_id");
  }

  let finalResult: Awaited<ReturnType<typeof client.queryKlingTaskResult>> | null = null;

  const pollResult = await pollVideoResult({
    pollFn: async () => {
      finalResult = await client.queryKlingTaskResult(KLING_MODELS.T2V, taskId);
      return finalResult;
    },
    isCompleted: (result) => client.isKlingTaskCompleted(result),
    isProcessing: (result) => client.isKlingTaskProcessing(result),
    isFailed: (result) => client.isKlingTaskFailed(result),
    getStatusMessage: (result) => result.data?.task_status || "unknown",
    extractVideoBase64: async (result) => client.extractKlingVideoBase64(result),
    pollInterval,
    maxWaitTime,
    logPrefix: "文生视频(Kling)",
    onDownload: async () => {
      if (!finalResult) return null;
      const videoBytes = await client.downloadKlingVideoContent(finalResult);
      const outputPath = generateVideoOutputPath(prompt, "mediaclaw_t2v_kling", outDir);
      saveArrayBufferVideo(videoBytes, outputPath);
      return outputPath;
    },
  });

  if (pollResult.error) {
    throw pollResult.error;
  }

  if (pollResult.timeout) {
    return {
      content: [{
        type: "text",
        text: `视频生成超时（${Math.round(maxWaitTime / 1000)}秒）\ntask_id: ${taskId}\n最后状态: ${pollResult.lastStatus}`,
      }],
    };
  }

  let outputPath: string;
  if (pollResult.videoPath) {
    outputPath = pollResult.videoPath;
  } else if (pollResult.videoBase64) {
    outputPath = generateVideoOutputPath(prompt, "mediaclaw_t2v_kling", outDir);
    saveBase64Video(pollResult.videoBase64, outputPath);
  } else {
    throw new Error("视频生成完成但未返回视频数据");
  }

  console.log(`[MediaClaw] 文生视频(Kling)完成！输出: ${outputPath}`);
  return {
    content: [{ type: "text", text: `文生视频(Kling)完成！\n输出文件: ${outputPath}` }],
  };
}
