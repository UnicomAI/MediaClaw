import { Type } from "@sinclair/typebox";
import {
  ToolResult,
  extractResourceId,
  KLING_MODELS,
  KlingMode,
  KlingDuration,
  KlingSound,
} from "../api/types.js";
import { ClientManager, SGLangClient, YuanjingClient } from "../api/index.js";
import { pollVideoResult } from "../utils/polling.js";
import {
  imageToBase64,
  saveBase64Video,
  generateVideoOutputPathFromBaseName,
  saveArrayBufferVideo,
} from "../utils/file.js";

export function registerImageToVideo(
  manager: ClientManager,
  outputDir?: string,
  pollInterval: number = 5000,
  maxWaitTime: number = 300000
) {
  return {
    name: "mediaclaw_image_to_video",
    description: "单图生视频 - 将单张图片转换为视频。支持 Wan 风格化视频（通用/吉卜力/皮克斯）或 Kling 图生视频。可通过配置选择模型，内部自动轮询，无需手动查询结果。",
    parameters: Type.Object({
      image_path: Type.String({ description: "输入图像文件路径（必填）" }),
      model: Type.Optional(Type.String({
        description: "视频生成模型（可选，覆盖配置文件设置）：wan（风格化视频）或 kling（Kling 图生视频）",
        enum: ["wan", "kling"],
      })),
      // Wan 专用参数
      style: Type.Optional(Type.String({
        description: "Wan 风格选项（仅 wan 模型有效）：通用、吉卜力、皮克斯，默认 通用",
        enum: ["通用", "吉卜力", "皮克斯"],
        default: "通用",
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
      prompt: Type.Optional(Type.String({ description: "视频描述文本（可选，wan 和 kling 均支持）" })),
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
      image_path: string;
      model?: "wan" | "kling";
      style?: string;
      mode?: KlingMode;
      duration?: KlingDuration;
      prompt?: string;
      negative_prompt?: string;
      sound?: KlingSound;
      cfg_scale?: number;
      output_dir?: string;
    }): Promise<ToolResult> {
      const imagePath = params.image_path;
      const outDir = params.output_dir || outputDir;

      // 动态获取客户端
      const client = manager.getClient("imageToVideo");

      // 确定使用的模型：参数优先，否则使用配置
      const videoModel = params.model || manager.getVideoModel("imageToVideo");

      // SGLang 客户端始终使用原有方式
      if (client instanceof SGLangClient) {
        return executeWanImageToVideo(
          client,
          imagePath,
          params.style || "通用",
          params.prompt || "",
          outDir,
          pollInterval,
          maxWaitTime
        );
      }

      // Yuanjing 客户端根据模型选择
      if (client instanceof YuanjingClient) {
        if (videoModel === "kling") {
          return executeKlingImageToVideo(
            client,
            imagePath,
            outDir,
            pollInterval,
            maxWaitTime,
            params
          );
        }
        // 默认使用 wan
        return executeWanImageToVideo(
          client,
          imagePath,
          params.style || "通用",
          params.prompt || "",
          outDir,
          pollInterval,
          maxWaitTime
        );
      }

      // 其他客户端类型，默认使用 wan 方式
      return executeWanImageToVideo(
        client as any,
        imagePath,
        params.style || "通用",
        params.prompt || "",
        outDir,
        pollInterval,
        maxWaitTime
      );
    },
  };
}

/**
 * 执行 Wan 图生视频
 */
async function executeWanImageToVideo(
  client: any,
  imagePath: string,
  style: string,
  prompt: string,
  outDir: string | undefined,
  pollInterval: number,
  maxWaitTime: number
): Promise<ToolResult> {
  const imageBase64 = imageToBase64(imagePath);
  const submitResponse = await client.submitImageToVideo(imageBase64, style, prompt);

  if (submitResponse.code !== 0) {
    throw new Error(`提交任务失败: ${submitResponse.msg}`);
  }

  const resourceId = extractResourceId(submitResponse);
  if (!resourceId) {
    throw new Error("未返回 resource_id");
  }

  const pollResult = await pollVideoResult({
    onDownload: client instanceof SGLangClient
      ? async () => {
          const videoBytes = await (client as SGLangClient).downloadVideoContent(resourceId);
          const baseName = imagePath.replace(/.*[/\\]/, "").replace(/\.[^.]+$/, "");
          const outputPath = generateVideoOutputPathFromBaseName(baseName, "mediaclaw_img2v", outDir);
          saveArrayBufferVideo(videoBytes, outputPath);
          return outputPath;
        }
      : undefined,
    pollFn: () => client.queryImageToVideoResult(resourceId),
    extractVideoBase64: (result) => client.extractVideoBase64(result),
    pollInterval,
    maxWaitTime,
    logPrefix: "图生视频(Wan)",
  });

  if (pollResult.error) {
    throw pollResult.error;
  }

  if (pollResult.timeout) {
    return {
      content: [{
        type: "text",
        text: `视频生成超时（${Math.round(maxWaitTime / 1000)}秒）\nresource_id: ${resourceId}`,
      }],
    };
  }

  if (!pollResult.videoBase64 && !pollResult.videoPath) {
    throw new Error("视频生成完成但未返回视频数据");
  }

  const baseName = imagePath.replace(/.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const outputPath = pollResult.videoPath || generateVideoOutputPathFromBaseName(baseName, "mediaclaw_img2v", outDir);
  if (pollResult.videoBase64) {
    saveBase64Video(pollResult.videoBase64, outputPath);
  }

  console.log(`[MediaClaw] 图生视频(Wan)完成！输出: ${outputPath}`);
  return {
    content: [{ type: "text", text: `图生视频(Wan)完成！\n输出文件: ${outputPath}` }],
  };
}

/**
 * 执行 Kling 图生视频
 */
async function executeKlingImageToVideo(
  client: YuanjingClient,
  imagePath: string,
  outDir: string | undefined,
  pollInterval: number,
  maxWaitTime: number,
  params: {
    mode?: KlingMode;
    duration?: KlingDuration;
    prompt?: string;
    negative_prompt?: string;
    sound?: KlingSound;
    cfg_scale?: number;
  }
): Promise<ToolResult> {
  const imageBase64 = imageToBase64(imagePath);

  const submitResponse = await client.submitKlingImageToVideo({
    image: imageBase64,
    mode: params.mode,
    duration: params.duration,
    prompt: params.prompt,
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
      finalResult = await client.queryKlingTaskResult(KLING_MODELS.I2V, taskId);
      return finalResult;
    },
    isCompleted: (result) => client.isKlingTaskCompleted(result),
    isProcessing: (result) => client.isKlingTaskProcessing(result),
    isFailed: (result) => client.isKlingTaskFailed(result),
    getStatusMessage: (result) => result.data?.task_status || "unknown",
    extractVideoBase64: async (result) => client.extractKlingVideoBase64(result),
    pollInterval,
    maxWaitTime,
    logPrefix: "图生视频(Kling)",
    onDownload: async () => {
      if (!finalResult) return null;
      const videoBytes = await client.downloadKlingVideoContent(finalResult);
      const baseName = imagePath.replace(/.*[/\\]/, "").replace(/\.[^.]+$/, "");
      const outputPath = generateVideoOutputPathFromBaseName(baseName, "mediaclaw_img2v_kling", outDir);
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

  if (!pollResult.videoBase64 && !pollResult.videoPath) {
    throw new Error("视频生成完成但未返回视频数据");
  }

  const baseName = imagePath.replace(/.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const outputPath = pollResult.videoPath || generateVideoOutputPathFromBaseName(baseName, "mediaclaw_img2v_kling", outDir);
  if (pollResult.videoBase64) {
    saveBase64Video(pollResult.videoBase64, outputPath);
  }

  console.log(`[MediaClaw] 图生视频(Kling)完成！输出: ${outputPath}`);
  return {
    content: [{ type: "text", text: `图生视频(Kling)完成！\n输出文件: ${outputPath}` }],
  };
}
