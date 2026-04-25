import * as fs from "fs";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import { execa } from "execa";
import { ToolResult } from "../api/types.js";

export function rgbToFfmpegHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `0x${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export async function replaceBackground(
  fgPath: string,
  bgPath: string,
  outputPath: string,
  targetColor: string = "0x00FF00",
  similarity: number = 0.3,
  smoothness: number = 0.04,
  loopBackground: boolean = true,
  overlayX: number = 0,
  overlayY: number = 0
): Promise<void> {
  const args: string[] = ["-y"];
  if (loopBackground) {
    args.push("-loop", "1");
  }

  const filterComplex =
    `[1:v]chromakey=${targetColor}:${similarity}:${smoothness}[fg];` +
    `[0:v][fg]overlay=${overlayX}:${overlayY}:shortest=1,scale=out_range=full[vout]`;

  args.push(
    "-i", bgPath,
    "-i", fgPath,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "1:a?",
    "-c:v", "libx264",
    "-crf", "18",
    "-pix_fmt", "yuvj420p",
    "-color_range", "pc",
    "-c:a", "aac",
    outputPath
  );

  await execa("ffmpeg", args);
}

export function registerReplaceBackground(outputDir?: string) {
  return {
    name: "mediaclaw_replace_background",
    description: "Replace green-screen background in a foreground video via ffmpeg. 本地处理，无需接口配置。",
    parameters: Type.Object({
      foreground_path: Type.String({ description: "Foreground video path (green-screen source)." }),
      background_path: Type.String({ description: "Background image/video path." }),
      output_path: Type.Optional(Type.String({ description: "Output video path." })),
      target_color: Type.Optional(Type.String({
        description: "Color key in hex, for example 0x00FF00.",
        default: "0x00FF00",
      })),
      similarity: Type.Optional(Type.Number({
        description: "Chroma key similarity threshold.",
        minimum: 0,
        maximum: 1,
        default: 0.3,
      })),
      smoothness: Type.Optional(Type.Number({
        description: "Chroma key smoothness threshold.",
        minimum: 0,
        maximum: 1,
        default: 0.04,
      })),
      loop_background: Type.Optional(Type.Boolean({
        description: "Whether to loop background input (for still images).",
        default: true,
      })),
      output_dir: Type.Optional(Type.String({ description: "Output directory." })),
    }),
    async execute(_id: string, params: {
      foreground_path: string;
      background_path: string;
      output_path?: string;
      target_color?: string;
      similarity?: number;
      smoothness?: number;
      loop_background?: boolean;
      output_dir?: string;
    }): Promise<ToolResult> {
      const foregroundPath = params.foreground_path;
      const backgroundPath = params.background_path;
      if (!foregroundPath || !fs.existsSync(foregroundPath)) {
        throw new Error(`Foreground file does not exist: ${foregroundPath}`);
      }
      if (!backgroundPath || !fs.existsSync(backgroundPath)) {
        throw new Error(`Background file does not exist: ${backgroundPath}`);
      }

      const outDir = params.output_dir || outputDir;
      let outputPath = params.output_path;
      if (!outputPath) {
        const fileName = `mediaclaw_with_bg_${path.basename(foregroundPath, path.extname(foregroundPath))}_${Date.now()}.mp4`;
        if (outDir) {
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          outputPath = path.resolve(outDir, fileName);
        } else {
          outputPath = path.resolve(fileName);
        }
      }

      try {
        await replaceBackground(
          foregroundPath,
          backgroundPath,
          outputPath,
          params.target_color || "0x00FF00",
          params.similarity ?? 0.3,
          params.smoothness ?? 0.04,
          params.loop_background ?? true,
          0,
          0
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Replace background failed: ${message}`);
      }

      return {
        content: [{
          type: "text",
          text: `Replace background completed.\nOutput file: ${outputPath}`,
        }],
      };
    },
  };
}
