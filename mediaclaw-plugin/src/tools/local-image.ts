import * as fs from "fs";
import * as path from "path";
import { Type, Static } from "@sinclair/typebox";
import { ToolResult } from "../api/types.js";
import { detectMime } from "../../mime.js";

import type { AgentToolResult } from "@mariozechner/pi-agent-core";

const MAX_IMAGE_BYTES = 5_000_000;
const MAX_VIDEO_BYTES = 50_000_000;

const LocalImageSchema = Type.Object({
  path: Type.String({
    description: "本地图片或视频文件的绝对路径或相对路径",
    maxLength: 4096,
  }),
}, { additionalProperties: false });

type LocalImageParams = Static<typeof LocalImageSchema>;

function isImageMime(mime: string | undefined): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

function isVideoMime(mime: string | undefined): boolean {
  return typeof mime === "string" && mime.startsWith("video/");
}

// export function registerLocalImage() {
//   return {
//     name: "mediaclaw_local_image",
//     description: "读取本地图片或视频文件并在 WebUI 中显示。支持 JPG、PNG、GIF、WebP、MP4、WebM 等格式。本地处理，无需接口配置。",
//     parameters: LocalImageSchema,
//     async execute(_id: string, params: LocalImageParams): Promise<ToolResult> {
//       if (!params.path) {
//         throw new Error("path 参数必填");
//       }

//       const filePath = path.resolve(params.path);

//       let fileBuffer: Buffer;
//       try {
//         fileBuffer = await fs.promises.readFile(filePath);
//       } catch {
//         throw new Error(`文件不存在: ${filePath}`);
//       }

//       const mimeType = detectMime(filePath) || "application/octet-stream";

//       if (isImageMime(mimeType)) {
//         if (fileBuffer.length > MAX_IMAGE_BYTES) {
//           throw new Error(`图片大小超出限制 (${Math.round(fileBuffer.length / 1024)}KB > ${MAX_IMAGE_BYTES / 1024}KB)`);
//         }
//       } else if (isVideoMime(mimeType)) {
//         if (fileBuffer.length > MAX_VIDEO_BYTES) {
//           throw new Error(`视频大小超出限制 (${Math.round(fileBuffer.length / 1024)}KB > ${MAX_VIDEO_BYTES / 1024}KB)`);
//         }
//       } else {
//         throw new Error(`不支持的文件类型: ${mimeType}`);
//       }

//       const base64 = fileBuffer.toString("base64");
//       const fileName = path.basename(filePath);

//       // const contents: ToolResult["content"] = [];

//       // if (isImageMime(mimeType)) {
//       //   contents.push({
//       //     type: "image",
//       //     data: base64,
//       //     media_type: mimeType,
//       //   });
//       // } else {
//       //   // 视频暂时以文本形式返回路径
//       //   contents.push({
//       //     type: "text",
//       //     text: `[local_video] ${fileName}\n路径: ${filePath}`,
//       //   });
//       // }

//       // contents.push({
//       //   type: "text",
//       //   text: `[local_image] ${fileName}`,
//       // });

//       // return { content: contents };

//       return {
//         content: [
//           {
//             type: "image",
//             source: {
//               type: "base64",
//               media_type: mimeType,
//               data: base64,
//             },
//           },
//           {
//             type: "text",
//             text: `[local_image] ${fileName}`,
//           },
//         ],
//         details: {
//           path: filePath,
//           media: { mediaUrl: filePath },
//         },
//       };
//     },
//   };
// }


export function registerLocalImage() {
  return {
    name: "local_image",
    label: "Local Image Viewer",
    description:
      "Read an image from local filesystem and display it in the chat. Supports JPG, PNG, GIF, WebP formats. The image will be displayed inline in WebChat UI.",
    parameters: LocalImageSchema,
    async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
      const p = params as LocalImageParams;

      if (!p.path) {
        throw new Error("path is required");
      }

      const imagePath = path.resolve(p.path);

      let fileBuffer: Buffer;
      try {
        fileBuffer = await fs.readFile(imagePath);
      } catch {
        throw new Error(`File not found: ${imagePath}`);
      }

      if (fileBuffer.length > MAX_IMAGE_BYTES) {
        throw new Error(
          `Image exceeds size limit (${Math.round(fileBuffer.length / 1024)}KB > ${MAX_IMAGE_BYTES / 1024}KB)`,
        );
      }

      const mimeType = detectMime(imagePath) || "application/octet-stream";
      if (!isImageMime(mimeType)) {
        throw new Error(`Not an image file: ${mimeType}`);
      }

      const base64 = fileBuffer.toString("base64");
      const fileName = path.basename(imagePath);

      return {
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `[local_image] ${fileName}`,
          },
        ],
        details: {
          path: imagePath,
          media: { mediaUrl: imagePath },
        },
      };
    },
  };
}
