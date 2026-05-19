import * as fs from "fs";
import * as path from "path";
import { execa } from "execa";
import { Type } from "@sinclair/typebox";
import { ToolResult } from "../api/types.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 覆盖层位置预设 */
export type OverlayPosition = 
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** 单个覆盖层配置 */
export interface OverlayConfig {
  /** 覆盖层文件路径（图片或视频） */
  file: string;
  /** 在输出视频中的开始时间（秒） */
  start: number;
  /** 持续时长（秒） */
  duration: number;
  /** 位置预设 */
  position?: OverlayPosition;
  /** X 坐标偏移（像素或表达式，如 '10' 或 'W-w-10'） */
  x?: string | number;
  /** Y 坐标偏移（像素或表达式，如 '10' 或 'H-h-10'） */
  y?: string | number;
  /** 透明度 (0-1) */
  opacity?: number;
  /** 缩放比例 (0-1 或 宽:高 如 '0.5' 或 '320:240') */
  scale?: number | string;
  /** 是否循环覆盖层视频 */
  loop?: boolean;
}

/** 覆盖层处理选项 */
export interface ApplyOverlayOptions {
  /** 输入视频路径 */
  inputPath: string;
  /** 输出视频路径 */
  outputPath: string;
  /** 覆盖层配置列表 */
  overlays: OverlayConfig[];
  /** 视频编码器 */
  videoCodec?: string;
  /** 视频预设 */
  videoPreset?: string;
  /** 视频质量 (CRF) */
  videoCrf?: number;
  /** 是否复制音频流 */
  copyAudio?: boolean;
  /** 额外的 FFmpeg 参数 */
  extraArgs?: string[];
}

// ============================================================================
// 常量定义
// ============================================================================

/** 位置预设到坐标的映射 */
const POSITION_MAP: Record<OverlayPosition, { x: string; y: string }> = {
  "top-left": { x: "10", y: "10" },
  "top-center": { x: "(W-w)/2", y: "10" },
  "top-right": { x: "W-w-10", y: "10" },
  "center-left": { x: "10", y: "(H-h)/2" },
  "center": { x: "(W-w)/2", y: "(H-h)/2" },
  "center-right": { x: "W-w-10", y: "(H-h)/2" },
  "bottom-left": { x: "10", y: "H-h-10" },
  "bottom-center": { x: "(W-w)/2", y: "H-h-10" },
  "bottom-right": { x: "W-w-10", y: "H-h-10" },
};

/** 默认编码参数 */
const DEFAULT_VIDEO_CODEC = "libx264";
const DEFAULT_VIDEO_PRESET = "fast";
const DEFAULT_VIDEO_CRF = 18;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 执行 FFmpeg 命令
 */
async function run(cmd: string[]): Promise<void> {
  await execa(cmd[0], cmd.slice(1), {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

/**
 * 解析位置配置，返回 x, y 坐标表达式
 */
function resolvePosition(overlay: OverlayConfig): { x: string; y: string } {
  // 优先使用显式坐标
  if (overlay.x !== undefined && overlay.y !== undefined) {
    return {
      x: String(overlay.x),
      y: String(overlay.y),
    };
  }

  // 使用位置预设
  if (overlay.position) {
    return POSITION_MAP[overlay.position] || POSITION_MAP["top-left"];
  }

  // 默认左上角
  return POSITION_MAP["top-left"];
}

/**
 * 构建覆盖层滤镜链
 */
function buildOverlayFilters(
  overlayCount: number,
  overlays: OverlayConfig[]
): string[] {
  const filterParts: string[] = [];

  // 为每个覆盖层创建输入标签
  for (let idx = 0; idx < overlayCount; idx++) {
    const overlay = overlays[idx];
    const start = overlay.start ?? 0;
    
    // 时间偏移
    filterParts.push(`[${idx + 1}:v]setpts=PTS-STARTPTS+${start}/TB[a${idx + 1}]`);
  }

  // 逐层叠加
  let current = "[0:v]";
  for (let idx = 0; idx < overlayCount; idx++) {
    const overlay = overlays[idx];
    const start = overlay.start ?? 0;
    const duration = overlay.duration ?? 0;
    const end = duration > 0 ? start + duration : 999999; // 无限时长
    
    const sourceLabel = `[a${idx + 1}]`;
    const outLabel = idx === overlayCount - 1 ? "[outv]" : `[v${idx + 1}]`;
    
    // 获取位置
    const { x, y } = resolvePosition(overlay);
    
    // 构建叠加滤镜
    let overlayFilter = `${current}${sourceLabel}overlay=`;
    
    // 时间控制（如果指定了 duration）
    if (duration > 0) {
      overlayFilter += `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})':`;
    }
    
    overlayFilter += `x=${x}:y=${y}`;
    
    // 透明度处理（如果指定）
    if (overlay.opacity !== undefined && overlay.opacity < 1) {
      // 需要先对覆盖层应用 format 和 colorchannelmixer
      // 这里简化处理，在主滤镜链中添加
    }
    
    overlayFilter += outLabel;
    filterParts.push(overlayFilter);
    current = outLabel;
  }

  return filterParts;
}

/**
 * 构建完整的 filter_complex
 */
function buildFilterComplex(
  overlays: OverlayConfig[],
  hasSubtitles: boolean = false,
  subtitlePath?: string,
  subtitleStyle?: string
): string {
  const filterParts: string[] = [];
  
  // 处理覆盖层缩放和透明度
  for (let idx = 0; idx < overlays.length; idx++) {
    const overlay = overlays[idx];
    const start = overlay.start ?? 0;
    let filter = `[${idx + 1}:v]setpts=PTS-STARTPTS+${start}/TB`;
    
    // 缩放
    if (overlay.scale !== undefined) {
      if (typeof overlay.scale === "number") {
        filter += `,scale=iw*${overlay.scale}:ih*${overlay.scale}`;
      } else {
        filter += `,scale=${overlay.scale}`;
      }
    }
    
    // 透明度
    if (overlay.opacity !== undefined && overlay.opacity < 1) {
      filter += `,format=rgba,colorchannelmixer=aa=${overlay.opacity}`;
    }
    
    filter += `[a${idx + 1}]`;
    filterParts.push(filter);
  }
  
  // 逐层叠加
  let current = "[0:v]";
  for (let idx = 0; idx < overlays.length; idx++) {
    const overlay = overlays[idx];
    const start = overlay.start ?? 0;
    const duration = overlay.duration ?? 0;
    const end = duration > 0 ? start + duration : 999999;
    
    const sourceLabel = `[a${idx + 1}]`;
    const outLabel = idx === overlays.length - 1 && !hasSubtitles ? "[outv]" : `[v${idx + 1}]`;
    
    const { x, y } = resolvePosition(overlay);
    
    let overlayFilter = `${current}${sourceLabel}overlay=`;
    if (duration > 0) {
      overlayFilter += `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})':`;
    }
    overlayFilter += `x=${x}:y=${y}${outLabel}`;
    
    filterParts.push(overlayFilter);
    current = outLabel;
  }
  
  // 字幕（可选）
  if (hasSubtitles && subtitlePath) {
    const escaped = subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    let subtitleFilter = `${current}subtitles='${escaped}'`;
    if (subtitleStyle) {
      subtitleFilter += `:force_style='${subtitleStyle}'`;
    }
    subtitleFilter += "[outv]";
    filterParts.push(subtitleFilter);
  }
  
  return filterParts.join(";");
}

/**
 * 应用覆盖层到视频
 */
export async function applyOverlay(options: ApplyOverlayOptions): Promise<void> {
  const {
    inputPath,
    outputPath,
    overlays,
    videoCodec = DEFAULT_VIDEO_CODEC,
    videoPreset = DEFAULT_VIDEO_PRESET,
    videoCrf = DEFAULT_VIDEO_CRF,
    copyAudio = true,
    extraArgs = [],
  } = options;

  if (!overlays || overlays.length === 0) {
    // 没有覆盖层，直接复制
    await run(["ffmpeg", "-y", "-i", inputPath, "-c", "copy", outputPath]);
    return;
  }

  // 构建输入参数
  const inputs: string[] = ["-i", inputPath];
  for (const overlay of overlays) {
    inputs.push("-i", overlay.file);
  }

  // 构建 filter_complex
  const filterComplex = buildFilterComplex(overlays);

  // 构建输出参数
  const outputArgs: string[] = [
    "-filter_complex", filterComplex,
    "-map", "[outv]",
    "-map", "0:a?",
    "-c:v", videoCodec,
    "-preset", videoPreset,
    "-crf", String(videoCrf),
    "-pix_fmt", "yuv420p",
  ];

  if (copyAudio) {
    outputArgs.push("-c:a", "copy");
  } else {
    outputArgs.push("-c:a", "aac", "-b:a", "192k");
  }

  outputArgs.push("-movflags", "+faststart", ...extraArgs, outputPath);

  // 执行命令
  const cmd = ["ffmpeg", "-y", ...inputs, ...outputArgs];
  await run(cmd);
}

/**
 * 应用覆盖层和字幕
 */
export async function applyOverlayAndSubtitles(
  inputPath: string,
  outputPath: string,
  overlays: OverlayConfig[],
  subtitlePath?: string,
  subtitleStyle?: string,
  options?: Partial<ApplyOverlayOptions>
): Promise<void> {
  const hasOverlays = overlays && overlays.length > 0;
  const hasSubtitles = !!subtitlePath;

  if (!hasOverlays && !hasSubtitles) {
    // 无需处理，直接复制
    await run(["ffmpeg", "-y", "-i", inputPath, "-c", "copy", outputPath]);
    return;
  }

  // 构建输入参数
  const inputs: string[] = ["-i", inputPath];
  for (const overlay of overlays || []) {
    inputs.push("-i", overlay.file);
  }

  // 构建 filter_complex
  const filterComplex = buildFilterComplex(
    overlays || [],
    hasSubtitles,
    subtitlePath,
    subtitleStyle
  );

  // 构建输出参数
  const {
    videoCodec = DEFAULT_VIDEO_CODEC,
    videoPreset = DEFAULT_VIDEO_PRESET,
    videoCrf = DEFAULT_VIDEO_CRF,
  } = options || {};

  const outputArgs: string[] = [
    "-filter_complex", filterComplex,
    "-map", "[outv]",
    "-map", "0:a?",
    "-c:v", videoCodec,
    "-preset", videoPreset,
    "-crf", String(videoCrf),
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-movflags", "+faststart",
    outputPath,
  ];

  // 执行命令
  const cmd = ["ffmpeg", "-y", ...inputs, ...outputArgs];
  await run(cmd);
}

// ============================================================================
// MCP Tool 注册
// ============================================================================

export function registerApplyOverlay(outputDir?: string) {
  return {
    name: "mediaclaw_apply_overlay",
    description: `在视频上叠加图片或视频覆盖层。支持多个覆盖层、位置控制、透明度、缩放、时间控制。

位置预设：
- top-left: 左上角
- top-center: 顶部居中
- top-right: 右上角
- center: 居中
- bottom-left: 左下角
- bottom-center: 底部居中
- bottom-right: 右下角

坐标表达式：
- W: 主视频宽度, H: 主视频高度
- w: 覆盖层宽度, h: 覆盖层高度
- 例如: "W-w-10" 表示右侧留10像素边距`,
    parameters: Type.Object({
      video_path: Type.String({ description: "输入视频路径" }),
      output_path: Type.Optional(Type.String({ description: "输出视频路径" })),
      output_dir: Type.Optional(Type.String({ description: "输出目录" })),
      overlays: Type.Array(Type.Object({
        file: Type.String({ description: "覆盖层文件路径（图片或视频）" }),
        start: Type.Number({ description: "开始时间（秒）" }),
        duration: Type.Number({ description: "持续时长（秒）" }),
        position: Type.Optional(Type.String({ description: "位置预设：top-left/top-center/top-right/center-left/center/center-right/bottom-left/bottom-center/bottom-right" })),
        x: Type.Optional(Type.Union([Type.String(), Type.Number()], { description: "X坐标（像素或表达式如 'W-w-10'）" })),
        y: Type.Optional(Type.Union([Type.String(), Type.Number()], { description: "Y坐标（像素或表达式如 'H-h-10'）" })),
        opacity: Type.Optional(Type.Number({ description: "透明度 0-1，默认 1（不透明）" })),
        scale: Type.Optional(Type.Union([Type.Number(), Type.String()], { description: "缩放比例，如 0.5 或 '320:240'" })),
      }), { description: "覆盖层配置列表" }),
      video_preset: Type.Optional(Type.String({ description: "视频编码预设，默认 fast" })),
      video_crf: Type.Optional(Type.Number({ description: "视频质量 CRF，默认 18" })),
    }),
    async execute(
      _id: string,
      params: {
        video_path: string;
        output_path?: string;
        output_dir?: string;
        overlays: Array<{
          file: string;
          start: number;
          duration: number;
          position?: string;
          x?: string | number;
          y?: string | number;
          opacity?: number;
          scale?: number | string;
        }>;
        video_preset?: string;
        video_crf?: number;
      }
    ): Promise<ToolResult> {
      const inputPath = params.video_path;

      // 验证输入文件
      if (!inputPath || !fs.existsSync(inputPath)) {
        throw new Error(`Video file does not exist: ${inputPath}`);
      }

      // 验证覆盖层文件
      for (const overlay of params.overlays) {
        if (!fs.existsSync(overlay.file)) {
          throw new Error(`Overlay file does not exist: ${overlay.file}`);
        }
      }

      // 确定输出路径
      let outputPath = params.output_path;
      if (!outputPath) {
        const ext = path.extname(inputPath) || ".mp4";
        const baseName = path.basename(inputPath, ext);
        const dir = params.output_dir || outputDir || path.dirname(inputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        outputPath = path.resolve(dir, `${baseName}_overlay${ext}`);
      }

      // 确保输出目录存在
      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      // 转换参数
      const overlays: OverlayConfig[] = params.overlays.map((o) => ({
        file: o.file,
        start: o.start,
        duration: o.duration,
        position: o.position as OverlayPosition | undefined,
        x: o.x,
        y: o.y,
        opacity: o.opacity,
        scale: o.scale,
      }));

      // 执行
      await applyOverlay({
        inputPath,
        outputPath,
        overlays,
        videoPreset: params.video_preset,
        videoCrf: params.video_crf,
      });

      return {
        content: [{
          type: "text",
          text: `Overlay applied successfully.\nInput: ${inputPath}\nOutput: ${outputPath}\nOverlays: ${overlays.length}`,
        }],
      };
    },
  };
}
