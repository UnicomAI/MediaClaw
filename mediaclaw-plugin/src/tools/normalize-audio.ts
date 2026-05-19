import * as fs from "fs";
import * as path from "path";
import { execa } from "execa";
import { Type } from "@sinclair/typebox";
import { ToolResult } from "../api/types.js";

// ============================================================================
// 常量定义
// ============================================================================

/** 默认响度参数 */
const DEFAULT_TARGET_LOUDNESS = -14;  // LUFS
const DEFAULT_TRUE_PEAK = -1;          // dB
const DEFAULT_LRA = 11;                // 响度范围
const DEFAULT_AUDIO_BITRATE = "192k";
const DEFAULT_AUDIO_SAMPLE_RATE = "48000";

/** FFmpeg 请求超时 */
const FFMPEG_TIMEOUT = 300000; // 5分钟

// ============================================================================
// 类型定义
// ============================================================================

/** 响度测量结果 */
export interface LoudnessMeasurement {
  input_i: string;       // 输入积分响度
  input_tp: string;      // 输入真峰值
  input_lra: string;     // 输入响度范围
  input_thresh: string;  // 输入阈值
  target_offset: string; // 目标偏移
}

/** 标准化模式 */
export type NormalizeMode = "auto" | "single" | "measure";

/** 标准化选项 */
export interface NormalizeOptions {
  targetLoudness?: number;
  truePeak?: number;
  lra?: number;
  mode?: NormalizeMode;
  copyVideo?: boolean;
  audioBitrate?: string;
  audioSampleRate?: string;
  outputPath?: string;
}

/** 标准化结果 */
export interface NormalizeResult {
  success: boolean;
  mode: "single_pass" | "two_pass" | "measurement_only";
  inputPath: string;
  outputPath?: string;
  measurement?: LoudnessMeasurement | null;
  message: string;
}

// ============================================================================
// 内部工具函数
// ============================================================================

/**
 * 执行 FFmpeg 命令
 */
async function run(cmd: string[]): Promise<void> {
  await execa(cmd[0], cmd.slice(1), {
    stdio: ["ignore", "inherit", "inherit"],
    timeout: FFMPEG_TIMEOUT,
  });
}

/**
 * 执行 FFmpeg 并捕获输出
 */
async function runCapture(cmd: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execa(cmd[0], cmd.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: FFMPEG_TIMEOUT,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * 测量音频响度
 * @param inputPath 输入文件路径
 * @param targetLoudness 目标响度（用于计算）
 * @returns 测量结果，失败返回 null
 */
export async function measureLoudness(
  inputPath: string,
  targetLoudness: number = DEFAULT_TARGET_LOUDNESS
): Promise<LoudnessMeasurement | null> {
  try {
    const result = await runCapture([
      "ffmpeg", "-y", "-hide_banner", "-nostats",
      "-i", inputPath,
      "-af", `loudnorm=I=${targetLoudness}:TP=${DEFAULT_TRUE_PEAK}:LRA=${DEFAULT_LRA}:print_format=json`,
      "-vn", "-f", "null", "-",
    ]);

    const stderr = result.stderr;
    const start = stderr.lastIndexOf("{");
    const end = stderr.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    const json = JSON.parse(stderr.slice(start, end + 1));
    const needed: (keyof LoudnessMeasurement)[] = [
      "input_i", "input_tp", "input_lra", "input_thresh", "target_offset"
    ];

    if (!needed.every((key) => key in json && json[key] !== undefined)) {
      return null;
    }

    return json as LoudnessMeasurement;
  } catch (error) {
    return null;
  }
}

/**
 * 单遍响度标准化
 * 快速但精度较低
 */
async function applySinglePass(
  inputPath: string,
  outputPath: string,
  targetLoudness: number = DEFAULT_TARGET_LOUDNESS,
  truePeak: number = DEFAULT_TRUE_PEAK,
  lra: number = DEFAULT_LRA,
  copyVideo: boolean = true,
  audioBitrate: string = DEFAULT_AUDIO_BITRATE,
  audioSampleRate: string = DEFAULT_AUDIO_SAMPLE_RATE
): Promise<void> {
  const args: string[] = [
    "ffmpeg", "-y", "-hide_banner", "-nostats",
    "-i", inputPath,
  ];

  if (copyVideo) {
    args.push("-c:v", "copy");
  }

  args.push(
    "-af", `loudnorm=I=${targetLoudness}:TP=${truePeak}:LRA=${lra}`,
    "-c:a", "aac", "-b:a", audioBitrate, "-ar", audioSampleRate,
    "-movflags", "+faststart",
    outputPath
  );

  await run(args);
}

/**
 * 两遍响度标准化
 * 先测量再应用，精度更高
 */
async function applyTwoPass(
  inputPath: string,
  outputPath: string,
  measurement: LoudnessMeasurement,
  targetLoudness: number = DEFAULT_TARGET_LOUDNESS,
  truePeak: number = DEFAULT_TRUE_PEAK,
  lra: number = DEFAULT_LRA,
  copyVideo: boolean = true,
  audioBitrate: string = DEFAULT_AUDIO_BITRATE,
  audioSampleRate: string = DEFAULT_AUDIO_SAMPLE_RATE
): Promise<void> {
  const args: string[] = [
    "ffmpeg", "-y", "-hide_banner", "-nostats",
    "-i", inputPath,
  ];

  if (copyVideo) {
    args.push("-c:v", "copy");
  }

  args.push(
    "-af", `loudnorm=I=${targetLoudness}:TP=${truePeak}:LRA=${lra}:measured_I=${measurement.input_i}:measured_TP=${measurement.input_tp}:measured_LRA=${measurement.input_lra}:measured_thresh=${measurement.input_thresh}:offset=${measurement.target_offset}:linear=true`,
    "-c:a", "aac", "-b:a", audioBitrate, "-ar", audioSampleRate,
    "-movflags", "+faststart",
    outputPath
  );

  await run(args);
}

/**
 * 音频响度标准化主函数
 */
export async function normalizeAudio(
  inputPath: string,
  outputPath: string,
  options: NormalizeOptions = {}
): Promise<NormalizeResult> {
  const {
    targetLoudness = DEFAULT_TARGET_LOUDNESS,
    truePeak = DEFAULT_TRUE_PEAK,
    lra = DEFAULT_LRA,
    mode = "auto",
    copyVideo = true,
    audioBitrate = DEFAULT_AUDIO_BITRATE,
    audioSampleRate = DEFAULT_AUDIO_SAMPLE_RATE,
  } = options;

  // 仅测量模式
  if (mode === "measure") {
    const measurement = await measureLoudness(inputPath, targetLoudness);
    return {
      success: true,
      mode: "measurement_only",
      inputPath,
      measurement,
      message: measurement
        ? `Measured loudness: ${measurement.input_i} LUFS`
        : "Failed to measure loudness",
    };
  }

  // 单遍模式
  if (mode === "single") {
    await applySinglePass(
      inputPath, outputPath, targetLoudness, truePeak, lra,
      copyVideo, audioBitrate, audioSampleRate
    );
    return {
      success: true,
      mode: "single_pass",
      inputPath,
      outputPath,
      message: `Normalized (single pass) to ${targetLoudness} LUFS`,
    };
  }

  // 自动/两遍模式
  const measurement = await measureLoudness(inputPath, targetLoudness);

  if (measurement) {
    await applyTwoPass(
      inputPath, outputPath, measurement, targetLoudness, truePeak, lra,
      copyVideo, audioBitrate, audioSampleRate
    );
    return {
      success: true,
      mode: "two_pass",
      inputPath,
      outputPath,
      measurement,
      message: `Normalized (two pass) to ${targetLoudness} LUFS`,
    };
  }

  // 测量失败，回退到单遍
  await applySinglePass(
    inputPath, outputPath, targetLoudness, truePeak, lra,
    copyVideo, audioBitrate, audioSampleRate
  );
  return {
    success: true,
    mode: "single_pass",
    inputPath,
    outputPath,
    measurement: null,
    message: `Normalized (single pass, measurement failed) to ${targetLoudness} LUFS`,
  };
}

// ============================================================================
// MCP Tool 注册
// ============================================================================

export function registerNormalizeAudio(outputDir?: string) {
  return {
    name: "mediaclaw_normalize_audio",
    description: `音频响度标准化工具。支持三种模式：
- auto: 自动两遍标准化（默认，精度最高）
- single: 单遍快速标准化
- measure: 仅测量响度，不处理

目标响度参考值：
- -14 LUFS: 流媒体平台标准（YouTube, Spotify 等）
- -16 LUFS: 播客常用
- -23 LUFS: 广播标准 (EBU R128)`,
    parameters: Type.Object({
      input_path: Type.String({ description: "输入音视频文件路径" }),
      output_path: Type.Optional(Type.String({ description: "输出文件路径（measure 模式可选）" })),
      mode: Type.Optional(Type.Union([
        Type.Literal("auto", { description: "自动选择：两遍标准化（默认）" }),
        Type.Literal("single", { description: "单遍快速标准化" }),
        Type.Literal("measure", { description: "仅测量响度，不处理" }),
      ])),
      target_loudness: Type.Optional(Type.Number({
        description: "目标响度 LUFS，默认 -14",
        minimum: -30,
        maximum: 0,
      })),
      true_peak: Type.Optional(Type.Number({
        description: "目标真峰值 dB，默认 -1",
        minimum: -9,
        maximum: 0,
      })),
      lra: Type.Optional(Type.Number({
        description: "目标响度范围，默认 11",
        minimum: 1,
        maximum: 20,
      })),
      copy_video: Type.Optional(Type.Boolean({
        description: "直接复制视频流（默认 true）",
      })),
      audio_bitrate: Type.Optional(Type.String({
        description: "音频比特率，默认 192k",
      })),
    }),
    async execute(
      _id: string,
      params: {
        input_path: string;
        output_path?: string;
        mode?: "auto" | "single" | "measure";
        target_loudness?: number;
        true_peak?: number;
        lra?: number;
        copy_video?: boolean;
        audio_bitrate?: string;
      }
    ): Promise<ToolResult> {
      const inputPath = params.input_path;

      // 验证输入文件
      if (!inputPath || !fs.existsSync(inputPath)) {
        throw new Error(`Input file does not exist: ${inputPath}`);
      }

      const mode = params.mode ?? "auto";

      // 仅测量模式不需要输出路径
      if (mode === "measure") {
        const measurement = await measureLoudness(inputPath, params.target_loudness);

        if (!measurement) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Failed to measure loudness. The file may not have audio or FFmpeg is not available.",
                input_path: inputPath,
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              mode: "measurement",
              input_path: inputPath,
              measurement: {
                integrated_loudness: `${measurement.input_i} LUFS`,
                true_peak: `${measurement.input_tp} dB`,
                loudness_range: `${measurement.input_lra} LU`,
                threshold: `${measurement.input_thresh} LUFS`,
                target_offset: `${measurement.target_offset} LU`,
              },
              recommended: {
                target_loudness: params.target_loudness ?? DEFAULT_TARGET_LOUDNESS,
                suggested_command: `ffmpeg -i "${inputPath}" -af "loudnorm=I=${params.target_loudness ?? DEFAULT_TARGET_LOUDNESS}:TP=${params.true_peak ?? DEFAULT_TRUE_PEAK}:LRA=${params.lra ?? DEFAULT_LRA}:measured_I=${measurement.input_i}:measured_TP=${measurement.input_tp}:measured_LRA=${measurement.input_lra}:measured_thresh=${measurement.input_thresh}:offset=${measurement.target_offset}:linear=true" -c:a aac -b:a 192k output.mp4`,
              },
            }, null, 2),
          }],
        };
      }

      // 确定输出路径
      let outputPath = params.output_path;
      if (!outputPath) {
        const ext = path.extname(inputPath) || ".mp4";
        const baseName = path.basename(inputPath, ext);
        const dir = path.dirname(inputPath);
        outputPath = path.join(dir, `${baseName}_normalized${ext}`);
      }

      // 确保输出目录存在
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 执行标准化
      const result = await normalizeAudio(inputPath, outputPath, {
        targetLoudness: params.target_loudness,
        truePeak: params.true_peak,
        lra: params.lra,
        mode,
        copyVideo: params.copy_video ?? true,
        audioBitrate: params.audio_bitrate,
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: result.success,
            mode: result.mode,
            input_path: result.inputPath,
            output_path: result.outputPath,
            measurement: result.measurement ? {
              integrated_loudness: `${result.measurement.input_i} LUFS`,
              true_peak: `${result.measurement.input_tp} dB`,
              loudness_range: `${result.measurement.input_lra} LU`,
            } : null,
            message: result.message,
          }, null, 2),
        }],
      };
    },
  };
}

// 导出内部函数供其他模块使用
export {
  measureLoudness,
  applySinglePass,
  applyTwoPass,
};
