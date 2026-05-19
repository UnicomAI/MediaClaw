import * as fs from "fs";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import { ToolResult } from "../api/types.js";

// ============================================================================
// SRT 工具函数
// ============================================================================

/**
 * 标点断句字符集合
 */
const PUNCT_BREAK = new Set([",", ".", "!", "?", ";", ":", "。", "，", "！", "？", "；", "："]);

/**
 * 将秒数转换为 SRT 时间戳格式 (HH:MM:SS,mmm)
 */
export function buildSrtTimestamp(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * 从 SRT 时间戳解析为秒数
 */
export function parseSrtTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) {
    throw new Error(`Invalid SRT timestamp: ${timestamp}`);
  }
  const [, h, m, s, ms] = match;
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms, 10) / 1000;
}

/**
 * Transcript 词项接口
 */
export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

/**
 * Transcript JSON 接口
 */
export interface Transcript {
  words?: TranscriptWord[];
  text?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

/**
 * SRT 条目接口
 */
export interface SrtEntry {
  index: number;
  start: number;
  end: number;
  text: string;
}

/**
 * SRT 生成选项
 */
export interface BuildSrtOptions {
  /** 每行最大词数（默认: 2） */
  maxWordsPerLine?: number;
  /** 是否在标点处断句（默认: true） */
  breakOnPunctuation?: boolean;
  /** 是否转为大写（默认: true） */
  uppercase?: boolean;
  /** 是否去除尾部标点（默认: true） */
  trimTrailingPunctuation?: boolean;
  /** 时间偏移量，秒（默认: 0） */
  timeOffset?: number;
  /** 最小字幕时长，秒（默认: 0.4） */
  minDuration?: number;
  /** 最大字幕时长，秒（默认: 无限制） */
  maxDuration?: number;
  /** 最大字符数（默认: 无限制） */
  maxChars?: number;
}

/**
 * 根据时间范围筛选词项
 */
export function filterWordsByRange(
  words: TranscriptWord[],
  start: number,
  end: number
): TranscriptWord[] {
  return words.filter((word) => {
    return word.end > start && word.start < end;
  });
}

/**
 * 调整词项时间（偏移 + 裁剪到范围内）
 */
export function adjustWordTimes(
  words: TranscriptWord[],
  rangeStart: number,
  rangeEnd: number,
  timeOffset: number = 0
): TranscriptWord[] {
  return words.map((word) => ({
    ...word,
    start: Math.max(0, word.start - rangeStart) + timeOffset,
    end: Math.max(0, word.end - rangeStart) + timeOffset,
  }));
}

/**
 * 将词项分块为字幕条目
 */
export function chunkWords(
  words: TranscriptWord[],
  options: BuildSrtOptions = {}
): Array<{ start: number; end: number; text: string }> {
  const {
    maxWordsPerLine = 2,
    breakOnPunctuation = true,
    trimTrailingPunctuation = true,
    minDuration = 0.4,
    maxDuration,
    maxChars,
  } = options;

  const chunks: Array<{ start: number; end: number; text: string }> = [];
  let current: TranscriptWord[] = [];
  let currentText = "";

  const flushChunk = () => {
    if (current.length === 0) return;

    const first = current[0];
    const last = current[current.length - 1];
    let text = current.map((w) => (w.text || "").trim()).join(" ");

    // 去除尾部标点
    if (trimTrailingPunctuation) {
      text = text.replace(/[,:;，、；：]+$/g, "");
    }

    // 空文本跳过
    if (!text.trim()) {
      current = [];
      currentText = "";
      return;
    }

    let start = first.start;
    let end = last.end;

    // 确保最小时长
    if (end - start < minDuration) {
      end = start + minDuration;
    }

    // 限制最大时长
    if (maxDuration && end - start > maxDuration) {
      end = start + maxDuration;
    }

    chunks.push({ start, end, text: text.trim() });
    current = [];
    currentText = "";
  };

  for (const word of words) {
    const text = (word.text || "").trim();
    if (!text) continue;

    const potentialText = currentText ? `${currentText} ${text}` : text;
    const endsInPunct = PUNCT_BREAK.has(text[text.length - 1]);

    // 检查是否需要刷新块
    const shouldFlush =
      // 达到最大词数
      current.length >= maxWordsPerLine ||
      // 达到最大字符数
      (maxChars && potentialText.length > maxChars) ||
      // 标点断句
      (breakOnPunctuation && endsInPunct && current.length > 0);

    current.push(word);
    currentText = potentialText;

    if (shouldFlush) {
      flushChunk();
    }
  }

  // 处理剩余的词
  flushChunk();

  return chunks;
}

/**
 * 从分块生成 SRT 条目
 */
export function generateSrtEntries(
  chunks: Array<{ start: number; end: number; text: string }>,
  options: BuildSrtOptions = {}
): SrtEntry[] {
  const { uppercase = true, timeOffset = 0 } = options;

  return chunks.map((chunk, index) => ({
    index: index + 1,
    start: chunk.start + timeOffset,
    end: chunk.end + timeOffset,
    text: uppercase ? chunk.text.toUpperCase() : chunk.text,
  }));
}

/**
 * 将 SRT 条目转换为字符串
 */
export function formatSrtContent(entries: SrtEntry[]): string {
  const lines: string[] = [];

  for (const entry of entries) {
    lines.push(String(entry.index));
    lines.push(`${buildSrtTimestamp(entry.start)} --> ${buildSrtTimestamp(entry.end)}`);
    lines.push(entry.text);
    lines.push(""); // 空行分隔
  }

  return lines.join("\n");
}

/**
 * 从 Transcript JSON 生成 SRT 内容
 */
export function generateSrtFromTranscript(
  transcript: Transcript,
  options: BuildSrtOptions = {}
): string {
  const words = transcript.words || [];

  if (words.length === 0) {
    // 尝试使用 segments
    if (transcript.segments && transcript.segments.length > 0) {
      const entries: SrtEntry[] = transcript.segments.map((seg, index) => ({
        index: index + 1,
        start: seg.start + (options.timeOffset || 0),
        end: seg.end + (options.timeOffset || 0),
        text: options.uppercase !== false ? seg.text.toUpperCase() : seg.text,
      }));
      return formatSrtContent(entries);
    }

    return "";
  }

  const chunks = chunkWords(words, options);
  const entries = generateSrtEntries(chunks, options);
  return formatSrtContent(entries);
}

/**
 * 从多个 Transcript 合并生成 SRT（用于 EDL 多片段场景）
 */
export function generateSrtFromTranscripts(
  transcriptSegments: Array<{
    transcript: Transcript;
    segmentStart: number;
    segmentEnd: number;
    outputOffset: number;
  }>,
  options: BuildSrtOptions = {}
): string {
  const allEntries: SrtEntry[] = [];
  let entryIndex = 1;

  for (const { transcript, segmentStart, segmentEnd, outputOffset } of transcriptSegments) {
    const words = transcript.words || [];
    const filteredWords = filterWordsByRange(words, segmentStart, segmentEnd);
    const adjustedWords = adjustWordTimes(filteredWords, segmentStart, segmentEnd, outputOffset);

    const chunks = chunkWords(adjustedWords, options);

    for (const chunk of chunks) {
      allEntries.push({
        index: entryIndex++,
        start: chunk.start,
        end: chunk.end,
        text: options.uppercase !== false ? chunk.text.toUpperCase() : chunk.text,
      });
    }
  }

  // 按开始时间排序
  allEntries.sort((a, b) => a.start - b.start);

  // 重新编号
  allEntries.forEach((entry, index) => {
    entry.index = index + 1;
  });

  return formatSrtContent(allEntries);
}

/**
 * 解析 SRT 文件内容为条目数组
 */
export function parseSrtContent(content: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);

    if (!timeMatch) continue;

    const start = parseSrtTimestamp(timeMatch[1]);
    const end = parseSrtTimestamp(timeMatch[2]);
    const text = lines.slice(2).join("\n");

    entries.push({ index, start, end, text });
  }

  return entries;
}

/**
 * 合并多个 SRT 文件（带时间偏移）
 */
export function mergeSrtFiles(
  srtFiles: Array<{ path: string; timeOffset: number }>,
  outputPath: string
): void {
  const allEntries: SrtEntry[] = [];
  let entryIndex = 1;

  for (const { path: filePath, timeOffset } of srtFiles) {
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf-8");
    const entries = parseSrtContent(content);

    for (const entry of entries) {
      allEntries.push({
        index: entryIndex++,
        start: entry.start + timeOffset,
        end: entry.end + timeOffset,
        text: entry.text,
      });
    }
  }

  // 按开始时间排序并重新编号
  allEntries.sort((a, b) => a.start - b.start);
  allEntries.forEach((entry, index) => {
    entry.index = index + 1;
  });

  fs.writeFileSync(outputPath, formatSrtContent(allEntries), "utf-8");
}

// ============================================================================
// MCP Tool 注册
// ============================================================================

export function registerBuildSrt(outputDir?: string) {
  return {
    name: "mediaclaw_build_srt",
    description:
      "从 transcript JSON 生成 SRT 字幕文件。支持时间范围筛选、时间偏移、自定义断句规则。",
    parameters: Type.Object({
      transcript_path: Type.String({ description: "Transcript JSON 文件路径" }),
      output_path: Type.Optional(Type.String({ description: "输出 SRT 文件路径" })),
      output_dir: Type.Optional(Type.String({ description: "输出目录" })),
      // 时间范围筛选
      start: Type.Optional(Type.Number({ description: "开始时间（秒），用于提取片段字幕" })),
      end: Type.Optional(Type.Number({ description: "结束时间（秒），用于提取片段字幕" })),
      time_offset: Type.Optional(Type.Number({ description: "时间偏移（秒），用于调整字幕时间轴" })),
      // 断句选项
      max_words_per_line: Type.Optional(Type.Number({ description: "每行最大词数，默认 2" })),
      max_chars: Type.Optional(Type.Number({ description: "每行最大字符数" })),
      break_on_punctuation: Type.Optional(Type.Boolean({ description: "在标点处断句，默认 true" })),
      // 格式选项
      uppercase: Type.Optional(Type.Boolean({ description: "转为大写，默认 true" })),
      trim_trailing_punctuation: Type.Optional(Type.Boolean({ description: "去除尾部标点，默认 true" })),
      min_duration: Type.Optional(Type.Number({ description: "最小字幕时长（秒），默认 0.4" })),
      max_duration: Type.Optional(Type.Number({ description: "最大字幕时长（秒）" })),
    }),
    async execute(
      _id: string,
      params: {
        transcript_path: string;
        output_path?: string;
        output_dir?: string;
        start?: number;
        end?: number;
        time_offset?: number;
        max_words_per_line?: number;
        max_chars?: number;
        break_on_punctuation?: boolean;
        uppercase?: boolean;
        trim_trailing_punctuation?: boolean;
        min_duration?: number;
        max_duration?: number;
      }
    ): Promise<ToolResult> {
      const { transcript_path } = params;

      // 验证输入文件
      if (!transcript_path || !fs.existsSync(transcript_path)) {
        throw new Error(`Transcript file does not exist: ${transcript_path}`);
      }

      // 读取 transcript
      const transcript: Transcript = JSON.parse(fs.readFileSync(transcript_path, "utf-8"));

      // 获取词项
      let words = transcript.words || [];

      // 如果没有 words 但有 segments，转换为 words 格式
      if (words.length === 0 && transcript.segments && transcript.segments.length > 0) {
        words = transcript.segments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        }));
      }

      // 时间范围筛选
      if (params.start !== undefined && params.end !== undefined) {
        words = filterWordsByRange(words, params.start, params.end);
        // 调整时间
        words = adjustWordTimes(words, params.start, params.end, params.time_offset || 0);
      } else if (params.time_offset) {
        words = words.map((w) => ({
          ...w,
          start: w.start + params.time_offset!,
          end: w.end + params.time_offset!,
        }));
      }

      // 构建选项
      const options: BuildSrtOptions = {
        maxWordsPerLine: params.max_words_per_line,
        maxChars: params.max_chars,
        breakOnPunctuation: params.break_on_punctuation,
        uppercase: params.uppercase,
        trimTrailingPunctuation: params.trim_trailing_punctuation,
        minDuration: params.min_duration,
        maxDuration: params.max_duration,
      };

      // 生成 SRT 内容
      const chunks = chunkWords(words, options);
      const entries = generateSrtEntries(chunks, options);
      const srtContent = formatSrtContent(entries);

      // 确定输出路径
      const outDir = params.output_dir || outputDir;
      let outputPath = params.output_path;
      if (!outputPath) {
        const baseName = path.basename(transcript_path, path.extname(transcript_path));
        const fileName = `${baseName}.srt`;
        if (outDir) {
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          outputPath = path.resolve(outDir, fileName);
        } else {
          outputPath = path.resolve(path.dirname(transcript_path), fileName);
        }
      }

      // 确保输出目录存在
      const outDirFinal = path.dirname(outputPath);
      if (!fs.existsSync(outDirFinal)) {
        fs.mkdirSync(outDirFinal, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(outputPath, srtContent, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `SRT generated successfully.\n` +
              `Output: ${outputPath}\n` +
              `Words processed: ${words.length}\n` +
              `Entries generated: ${entries.length}`,
          },
        ],
      };
    },
  };
}

/**
 * 注册合并 SRT 工具
 */
export function registerMergeSrt(outputDir?: string) {
  return {
    name: "mediaclaw_merge_srt",
    description:
      "合并多个 SRT 文件，支持时间偏移。适用于拼接多段视频的字幕。",
    parameters: Type.Object({
      srt_files: Type.Array(
        Type.Object({
          path: Type.String({ description: "SRT 文件路径" }),
          time_offset: Type.Number({ description: "时间偏移（秒）" }),
        }),
        { description: "SRT 文件列表及时间偏移" }
      ),
      output_path: Type.String({ description: "输出 SRT 文件路径" }),
    }),
    async execute(
      _id: string,
      params: {
        srt_files: Array<{ path: string; time_offset: number }>;
        output_path: string;
      }
    ): Promise<ToolResult> {
      const { srt_files, output_path } = params;

      if (!srt_files || srt_files.length === 0) {
        throw new Error("No SRT files provided");
      }

      // 验证文件存在
      for (const file of srt_files) {
        if (!fs.existsSync(file.path)) {
          throw new Error(`SRT file does not exist: ${file.path}`);
        }
      }

      // 确保输出目录存在
      const outDir = path.dirname(output_path);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      // 合并
      mergeSrtFiles(srt_files, output_path);

      // 统计信息
      const content = fs.readFileSync(output_path, "utf-8");
      const entries = parseSrtContent(content);

      return {
        content: [
          {
            type: "text",
            text: `SRT files merged successfully.\n` +
              `Input files: ${srt_files.length}\n` +
              `Total entries: ${entries.length}\n` +
              `Output: ${output_path}`,
          },
        ],
      };
    },
  };
}