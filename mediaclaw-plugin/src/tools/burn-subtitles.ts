import * as fs from "fs";
import * as path from "path";
import { execa } from "execa";
import { Type } from "@sinclair/typebox";
import { ToolResult } from "../api/types.js";

// ============================================================================
// 字幕工具函数 (原 subtitle-utils.ts)
// ============================================================================

/**
 * 默认字幕样式 (用于 SRT 烧录)
 */
export const DEFAULT_SUBTITLE_STYLE = (
  "FontName=Helvetica,FontSize=18,Bold=1," +
  "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000," +
  "BorderStyle=1,Outline=2,Shadow=0," +
  "Alignment=2,MarginV=90"
);

/**
 * 转义字幕路径以用于 FFmpeg 滤镜
 * 处理 Windows 反斜杠、冒号和单引号
 */
export function escapeSubtitlePath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

/**
 * 字幕烧录选项
 */
export interface BurnSubtitlesOptions {
  /** 字幕样式 (仅对 SRT/ASS 格式有效) */
  forceStyle?: string;
  /** 视频编码器 (默认: copy) */
  videoCodec?: string;
  /** 音频编码器 (默认: copy) */
  audioCodec?: string;
  /** 额外的 FFmpeg 参数 */
  extraArgs?: string[];
}

/**
 * 烧录字幕到视频
 * 支持 SRT、ASS、SSA 格式，自动识别并选择合适的滤镜
 */
export async function burnSubtitles(
  videoPath: string,
  subtitlePath: string,
  outputPath: string,
  options: BurnSubtitlesOptions = {}
): Promise<void> {
  const escapedPath = escapeSubtitlePath(subtitlePath);
  const ext = path.extname(subtitlePath).toLowerCase();

  // 根据字幕格式选择滤镜
  let filter: string;
  if (ext === ".ass" || ext === ".ssa") {
    // ASS/SSA 格式使用 ass 滤镜
    filter = `ass='${escapedPath}'`;
    // ASS 格式的 force_style 需要单独处理
    if (options.forceStyle) {
      // ASS 格式的样式已在文件中定义，这里可以选择覆盖或忽略
      // 如需强制样式，可使用 subtitles 滤镜代替
      filter = `subtitles='${escapedPath}':force_style='${options.forceStyle}'`;
    }
  } else {
    // SRT 等格式使用 subtitles 滤镜
    filter = `subtitles='${escapedPath}'`;
    if (options.forceStyle) {
      filter += `:force_style='${options.forceStyle}'`;
    }
  }

  const args: string[] = ["-y", "-i", videoPath, "-vf", filter];

  // 视频编码器
  if (options.videoCodec && options.videoCodec !== "copy") {
    args.push("-c:v", options.videoCodec);
  } else {
    args.push("-c:v", "copy");
  }

  // 音频编码器
  if (options.audioCodec && options.audioCodec !== "copy") {
    args.push("-c:a", options.audioCodec);
  } else {
    args.push("-c:a", "copy");
  }

  // 额外参数
  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }

  args.push(outputPath);

  await execa("ffmpeg", args);
}

/**
 * 检测字幕格式
 */
export function getSubtitleFormat(filePath: string): "ass" | "srt" | "unknown" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ass" || ext === ".ssa") {
    return "ass";
  }
  if (ext === ".srt") {
    return "srt";
  }
  return "unknown";
}

// ============================================================================
// MCP Tool 注册
// ============================================================================

export function registerBurnSubtitles(outputDir?: string) {
  return {
    name: "mediaclaw_burn_subtitles",
    description: "Burn a subtitle file (SRT/ASS/SSA) into a video via ffmpeg. 本地处理，无需接口配置。",
    parameters: Type.Object({
      video_path: Type.String({ description: "Input video path." }),
      subtitle_path: Type.String({ description: "Subtitle file path (SRT/ASS/SSA supported)." }),
      output_path: Type.Optional(Type.String({ description: "Output video path." })),
      output_dir: Type.Optional(Type.String({ description: "Output directory." })),
      force_style: Type.Optional(Type.String({ description: "Override subtitle style." })),
    }),
    async execute(_id: string, params: {
      video_path: string;
      subtitle_path: string;
      output_path?: string;
      output_dir?: string;
      force_style?: string;
    }): Promise<ToolResult> {
      const videoPath = params.video_path;
      const subtitlePath = params.subtitle_path;

      if (!videoPath || !fs.existsSync(videoPath)) {
        throw new Error(`Video file does not exist: ${videoPath}`);
      }
      if (!subtitlePath || !fs.existsSync(subtitlePath)) {
        throw new Error(`Subtitle file does not exist: ${subtitlePath}`);
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
        await burnSubtitles(videoPath, subtitlePath, outputPath, {
          forceStyle: params.force_style,
        });
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