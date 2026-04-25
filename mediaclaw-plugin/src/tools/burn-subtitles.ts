import * as fs from "fs";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import { execa } from "execa";
import { ToolResult } from "../api/types.js";

function toFfmpegAssPath(inputPath: string): string {
  return inputPath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

async function burnAssSubtitles(videoPath: string, assPath: string, outputPath: string): Promise<void> {
  const processedAssPath = toFfmpegAssPath(assPath);
  await execa("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-vf", `ass='${processedAssPath}'`,
    "-c:a", "copy",
    outputPath,
  ]);
}

export function registerBurnSubtitles(outputDir?: string) {
  return {
    name: "mediaclaw_burn_subtitles",
    description: "Burn an ASS subtitle file into a video via ffmpeg. 本地处理，无需接口配置。",
    parameters: Type.Object({
      video_path: Type.String({ description: "Input video path." }),
      ass_path: Type.String({ description: "ASS subtitle path." }),
      output_path: Type.Optional(Type.String({ description: "Output video path." })),
      output_dir: Type.Optional(Type.String({ description: "Output directory." })),
    }),
    async execute(_id: string, params: {
      video_path: string;
      ass_path: string;
      output_path?: string;
      output_dir?: string;
    }): Promise<ToolResult> {
      const videoPath = params.video_path;
      const assPath = params.ass_path;

      if (!videoPath || !fs.existsSync(videoPath)) {
        throw new Error(`Video file does not exist: ${videoPath}`);
      }
      if (!assPath || !fs.existsSync(assPath)) {
        throw new Error(`Subtitle file does not exist: ${assPath}`);
      }

      const outDir = params.output_dir || outputDir;
      let outputPath = params.output_path;
      if (!outputPath) {
        const fileName = `mediaclaw_with_subs_${path.basename(videoPath, path.extname(videoPath))}_${Date.now()}${path.extname(videoPath) || ".mp4"}`;
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
        await burnAssSubtitles(videoPath, assPath, outputPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Burn subtitles failed: ${message}`);
      }

      return {
        content: [{
          type: "text",
          text: `Burn subtitles completed.\nOutput file: ${outputPath}`,
        }],
      };
    },
  };
}
