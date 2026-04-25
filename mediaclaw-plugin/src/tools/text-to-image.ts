import { Type } from "@sinclair/typebox";
import { ToolResult } from "../api/types.js";
import { ClientManager } from "../api/client-manager.js";
import { saveBase64Image, generateImageOutputPath } from "../utils/file.js";

export function registerTextToImage(manager: ClientManager, outputDir?: string) {
  return {
    name: "mediaclaw_text_to_image",
    description: "文生图 - 使用 Qwen-Image 20B 大模型（yuanjing）或对应模型（sglang），通过文本描述生成图片。支持中英文，支持多种宽高比。",
    parameters: Type.Object({
      prompt: Type.String({ description: "图片描述文本（必填）" }),
      size: Type.String({
        description: "生成图片的分辨率，格式为 {width}x{height} 或宽高比（如 16:9），默认 1024x1024",
        default: "1024x1024",
      }),
      n: Type.Integer({
        description: "生成图片张数（1-2），默认 1",
        minimum: 1,
        maximum: 2,
        default: 1,
      }),
      model: Type.String({
        description: "模型 ID，默认 qwen-image-20b（yuanjing）或 image-01（sglang）",
        default: "qwen-image-20b",
      }),
      output_dir: Type.Optional(Type.String({ description: "输出目录路径" })),
    }),
    async execute(_id: string, params: {
      prompt: string;
      size?: string;
      n?: number;
      model?: string;
      output_dir?: string;
    }): Promise<ToolResult> {
      const prompt = params.prompt;
      const size = params.size || "1024x1024";
      const n = params.n || 1;
      const model = params.model || "qwen-image-20b";
      const outDir = params.output_dir || outputDir;

      if (n < 1 || n > 2) {
        throw new Error("生成图片数量必须在 1-2 之间");
      }

      // 动态获取客户端
      const client = manager.getClient("textToImage");

      const response = await client.textToImage(prompt, size, n, model);

      if (response.code !== 0) {
        const msg = response.msg || "未知错误";
        if (response.code === 1003) {
          throw new Error(`触发敏感内容检测: ${msg}`);
        }
        throw new Error(`请求失败: ${msg}`);
      }

      const data = response.data as Array<{ b64_json?: string; url?: string }> | undefined;
      if (!data || data.length === 0) {
        throw new Error("未生成图片");
      }

      const savedFiles: string[] = [];
      const contents: ToolResult["content"] = [];

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const b64Data = item?.b64_json;
        if (!b64Data) continue;
        const outputPath = generateImageOutputPath(prompt, data.length > 1 ? i : 0, outDir);
        saveBase64Image(b64Data, outputPath);
        savedFiles.push(outputPath);
      }

      contents.push({
        type: "text",
        text: `文生图成功！\n生成 ${savedFiles.length} 张图片：\n${savedFiles.map(f => `  - ${f}`).join("\n")}`,
      });

      for (let i = 0; i < Math.min(data.length, 3); i++) {
        const b64Data = data[i]?.b64_json;
        if (b64Data) {
          contents.push({
            type: "image",
            data: b64Data,
            mimeType: "image/png",
          });
        }
      }

      return { content: contents };
    },
  };
}
