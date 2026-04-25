import { Type } from "@sinclair/typebox";
import { ToolResult } from "../api/types.js";
import { ClientManager } from "../api/client-manager.js";
import { imageToBase64DataUrl } from "../utils/file.js";

function isUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

function isBase64(str: string): boolean {
  return str.startsWith("data:image/") || /^[A-Za-z0-9+/=]{20,}$/.test(str);
}

function processImageInput(input: string): string {
  if (isUrl(input)) {
    return input;
  }
  if (isBase64(input)) {
    if (input.startsWith("data:")) {
      return input;
    }
    return `data:image/png;base64,${input}`;
  }
  return imageToBase64DataUrl(input);
}

export function registerImageQA(manager: ClientManager) {
  return {
    name: "mediaclaw_image_qa",
    description: "图文问答 - 使用视觉语言模型，针对图片进行问答、分析、描述或生成分镜脚本。支持 yuanjing（YuanjingVL）和 sglang（VLM）接口。",
    parameters: Type.Object({
      images: Type.Array(Type.String(), {
        description: "图片输入列表（必填）。支持：1) 本地文件路径如 /path/to/image.jpg 2) URL 如 https://example.com/image.jpg 3) base64 如 data:image/png;base64,...",
      }),
      prompt: Type.String({ description: "询问/指令文本（必填），例如 '描述这张图片'、'分析画面内容'、'生成视频分镜'" }),
      mode: Type.Optional(Type.String({
        description: "模式：general（通用问答）、storyboard（分镜生成）、firstlast（首尾帧过渡分镜），默认 general（仅 yuanjing 支持）",
        enum: ["general", "storyboard", "firstlast"],
        default: "general",
      })),
    }),
    async execute(_id: string, params: {
      images: string[];
      prompt: string;
      mode?: string;
    }): Promise<ToolResult> {
      const imageInputs = params.images;
      const prompt = params.prompt;
      const mode = params.mode || "general";

      const imageDataUrls = imageInputs.map(input => processImageInput(input));

      // 动态获取客户端
      const client = manager.getClient("imageQA");

      const response = await client.imageQA(imageDataUrls, prompt, mode);

      const choices = (response as { choices?: Array<{ message?: { content?: string } }> }).choices;
      if (!choices || !choices[0]?.message?.content) {
        throw new Error("无效的响应格式");
      }

      let content = choices[0].message.content;

      try {
        const parsed = JSON.parse(content);
        content = JSON.stringify(parsed, null, 2);
      } catch {
      }

      return {
        content: [{ type: "text", text: content }],
      };
    },
  };
}
