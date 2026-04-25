import { Type } from "@sinclair/typebox";
import {
  ToolResult,
  extractResourceId,
  CAPABILITY_SUPPORT,
  KLING_MODELS,
  KlingMode,
  KlingDuration,
  KlingSound,
} from "../api/types.js";
import { ClientManager, YuanjingClient } from "../api/index.js";
import { pollVideoResult } from "../utils/polling.js";
import {
  imageToBase64,
  saveBase64Video,
  generateVideoOutputPath,
  saveArrayBufferVideo,
} from "../utils/file.js";

export function registerImagesToVideo(
  manager: ClientManager,
  outputDir?: string,
  pollInterval: number = 5000,
  maxWaitTime: number = 300000
) {
  return {
    name: "mediaclaw_images_to_video",
    description: "多图生视频/首尾帧生视频 - 支持 Wan（首尾帧/参考图模式）或 Kling（首尾帧过渡）。注意：仅支持 yuanjing 接口。内部自动轮询，无需手动查询结果。",
    parameters: Type.Object({
      model: Type.Optional(Type.String({
        description: "视频生成模型（可选，覆盖配置文件设置）：wan（Wan 多图生视频）或 kling（Kling 首尾帧过渡）",
        enum: ["wan", "kling"],
      })),
      task_type: Type.String({
        description: "任务类型：first_last_frame（首尾帧模式）或 ref_images（参考图模式，仅 wan 模型支持）",
        enum: ["first_last_frame", "ref_images"],
      }),
      first_image: Type.Optional(Type.String({ description: "首帧图片路径（首尾帧模式使用，wan 和 kling 均支持）" })),
      last_image: Type.Optional(Type.String({ description: "尾帧图片路径（首尾帧模式使用，wan 和 kling 均支持）" })),
      images: Type.Optional(Type.Array(Type.String(), {
        description: "参考图片路径列表（参考图模式使用，仅 wan 模型支持，最多 3 张）",
      })),
      prompt: Type.Optional(Type.String({ description: "视频描述文本（可选，wan 和 kling 均支持）" })),
      // Kling 专用参数
      mode: Type.Optional(Type.String({
        description: "Kling 生成模式（仅 kling 模型有效）：std（标准模式，性价比高）或 pro（专家模式，高品质）",
        enum: ["std", "pro"],
      })),
      duration: Type.Optional(Type.String({
        description: "Kling 视频时长（仅 kling 模型有效）：5 或 10 秒",
        enum: ["5", "10"],
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
      model?: "wan" | "kling";
      task_type: string;
      first_image?: string;
      last_image?: string;
      images?: string[];
      prompt?: string;
      mode?: KlingMode;
      duration?: KlingDuration;
      negative_prompt?: string;
      sound?: KlingSound;
      cfg_scale?: number;
      output_dir?: string;
    }): Promise<ToolResult> {
      // 验证能力是否可用
      if (!manager.isCapabilityAvailable("imagesToVideo")) {
        const supported = CAPABILITY_SUPPORT.imagesToVideo.join(", ");
        throw new Error(
          `多图生视频功能需要配置 yuanjing 提供商。支持的提供商: ${supported}\n` +
          `请在配置中添加 providers.yuanjing 配置项。`
        );
      }

      const client = manager.getClient("imagesToVideo");
      if (!(client instanceof YuanjingClient)) {
        throw new Error("多图生视频功能仅支持 yuanjing 提供商，请使用 provider=yuanjing 配置");
      }

      // 确定使用的模型：参数优先，否则使用配置（默认 wan）
      const videoModel = params.model || "wan";
      const outDir = params.output_dir || outputDir;

      if (videoModel === "kling") {
        return executeKlingImagesToVideo(
          client,
          params,
          outDir,
          pollInterval,
          maxWaitTime
        );
      } else {
        return executeWanImagesToVideo(
          client,
          params,
          outDir,
          pollInterval,
          maxWaitTime
        );
      }
    },
  };
}

/**
 * 执行 Wan 多图生视频
 */
async function executeWanImagesToVideo(
  client: YuanjingClient,
  params: {
    task_type: string;
    first_image?: string;
    last_image?: string;
    images?: string[];
    prompt?: string;
  },
  outDir: string | undefined,
  pollInterval: number,
  maxWaitTime: number
): Promise<ToolResult> {
  const taskType = params.task_type;
  const prompt = params.prompt || "";

  let imagesBase64: string[] = [];

  if (taskType === "first_last_frame") {
    if (!params.first_image || !params.last_image) {
      throw new Error("首尾帧模式需要同时指定 first_image 和 last_image");
    }
    imagesBase64 = [imageToBase64(params.first_image), imageToBase64(params.last_image)];
  } else if (taskType === "ref_images") {
    const images = params.images;
    if (!images || images.length === 0) {
      throw new Error("参考图模式需要至少指定一张图片");
    }
    if (images.length > 3) {
      throw new Error("参考图模式最多支持 3 张图片");
    }
    imagesBase64 = images.map(p => imageToBase64(p));
  } else {
    throw new Error(`不支持的任务类型: ${taskType}`);
  }

  const submitResponse = await client.submitImagesToVideo(taskType, imagesBase64, prompt);

  if (submitResponse.code !== 0) {
    throw new Error(`提交任务失败: ${submitResponse.msg}`);
  }

  const resourceId = extractResourceId(submitResponse);
  if (!resourceId) {
    throw new Error("未返回 resource_id");
  }

  const pollResult = await pollVideoResult({
    pollFn: () => client.queryImagesToVideoResult(resourceId),
    extractVideoBase64: (result) => client.extractVideoBase64(result),
    pollInterval,
    maxWaitTime,
    logPrefix: "多图生视频(Wan)",
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

  if (!pollResult.videoBase64) {
    throw new Error("视频生成完成但未返回视频数据");
  }

  const outputPath = generateVideoOutputPath(prompt || "multi_images", "mediaclaw_imgs2v", outDir);
  saveBase64Video(pollResult.videoBase64, outputPath);

  console.log(`[MediaClaw] 多图生视频(Wan)完成！输出: ${outputPath}`);
  return {
    content: [{ type: "text", text: `多图生视频(Wan)完成！\n输出文件: ${outputPath}` }],
  };
}

/**
 * 执行 Kling 首尾帧生视频
 */
async function executeKlingImagesToVideo(
  client: YuanjingClient,
  params: {
    task_type: string;
    first_image?: string;
    last_image?: string;
    prompt?: string;
    mode?: KlingMode;
    duration?: KlingDuration;
    negative_prompt?: string;
    sound?: KlingSound;
    cfg_scale?: number;
  },
  outDir: string | undefined,
  pollInterval: number,
  maxWaitTime: number
): Promise<ToolResult> {
  const taskType = params.task_type;

  // Kling 仅支持首尾帧模式
  if (taskType !== "first_last_frame") {
    throw new Error("Kling 模型仅支持 first_last_frame（首尾帧）模式");
  }

  if (!params.first_image || !params.last_image) {
    throw new Error("首尾帧模式需要同时指定 first_image 和 last_image");
  }

  const firstImageBase64 = imageToBase64(params.first_image);
  const lastImageBase64 = imageToBase64(params.last_image);

  const submitResponse = await client.submitKlingImageToVideo({
    image: firstImageBase64,
    image_tail: lastImageBase64,
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
    logPrefix: "首尾帧生视频(Kling)",
    onDownload: async () => {
      if (!finalResult) return null;
      const videoBytes = await client.downloadKlingVideoContent(finalResult);
      const baseName = "kling_first_last";
      const outputPath = `${outDir || "."}/${baseName}_${Date.now()}.mp4`;
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
    const baseName = "kling_first_last";
    outputPath = `${outDir || "."}/${baseName}_${Date.now()}.mp4`;
    saveBase64Video(pollResult.videoBase64, outputPath);
  } else {
    throw new Error("视频生成完成但未返回视频数据");
  }

  console.log(`[MediaClaw] 首尾帧生视频(Kling)完成！输出: ${outputPath}`);
  return {
    content: [{ type: "text", text: `首尾帧生视频(Kling)完成！\n输出文件: ${outputPath}` }],
  };
}
