import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execa } from "execa";

export interface WavInfo {
  formatCode: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
  durationSec: number;
}

export interface PreparedDigitalAvatarAudio {
  audioBase64: string;
  durationSec: number;
  normalized: boolean;
  wavInfo: WavInfo;
  cleanup?: () => void;
}

function isRiffWave(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

export function parseWavInfo(buffer: Buffer): WavInfo | null {
  if (!isRiffWave(buffer)) {
    return null;
  }

  let offset = 12;
  let formatCode = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;

    if (dataEnd > buffer.length) {
      break;
    }

    if (chunkId === "fmt " && chunkSize >= 16) {
      formatCode = buffer.readUInt16LE(dataStart);
      channels = buffer.readUInt16LE(dataStart + 2);
      sampleRate = buffer.readUInt32LE(dataStart + 4);
      bitsPerSample = buffer.readUInt16LE(dataStart + 14);
    } else if (chunkId === "data") {
      dataBytes += chunkSize;
    }

    offset = dataEnd + (chunkSize % 2);
  }

  const bytesPerSample = bitsPerSample / 8;
  if (
    !formatCode ||
    !channels ||
    !sampleRate ||
    !bitsPerSample ||
    !dataBytes ||
    !Number.isFinite(bytesPerSample) ||
    bytesPerSample <= 0
  ) {
    return null;
  }

  const durationSec = dataBytes / (sampleRate * channels * bytesPerSample);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }

  return {
    formatCode,
    channels,
    sampleRate,
    bitsPerSample,
    dataBytes,
    durationSec,
  };
}

function isCanonicalAvatarWav(info: WavInfo): boolean {
  return info.formatCode === 1 && info.channels === 1 && info.bitsPerSample === 16;
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execa("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function transcodeToAvatarWav(inputPath: string): Promise<{ outputPath: string; cleanup: () => void }> {
  if (!(await hasFfmpeg())) {
    throw new Error(
      "Audio format is not compatible with digital avatar and ffmpeg is not available. Please install ffmpeg or provide a mono 16-bit PCM WAV file."
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediaclaw-avatar-audio-"));
  const outputPath = path.join(tempDir, "normalized.wav");
  const args = [
    "-y",
    "-v",
    "error",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "24000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ];

  try {
    await execa("ffmpeg", args);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to normalize audio with ffmpeg${detail ? `: ${detail}` : ""}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error("Failed to normalize audio with ffmpeg: output file not found");
  }

  return {
    outputPath,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
    },
  };
}

export async function prepareDigitalAvatarAudio(audioPath: string): Promise<PreparedDigitalAvatarAudio> {
  const originalBuffer = fs.readFileSync(audioPath);
  const originalInfo = parseWavInfo(originalBuffer);

  if (originalInfo && isCanonicalAvatarWav(originalInfo)) {
    return {
      audioBase64: originalBuffer.toString("base64"),
      durationSec: originalInfo.durationSec,
      normalized: false,
      wavInfo: originalInfo,
    };
  }

  const { outputPath, cleanup } = await transcodeToAvatarWav(audioPath);
  const normalizedBuffer = fs.readFileSync(outputPath);
  const normalizedInfo = parseWavInfo(normalizedBuffer);
  if (!normalizedInfo) {
    cleanup();
    throw new Error("Audio normalization succeeded but resulting WAV is still invalid.");
  }

  return {
    audioBase64: normalizedBuffer.toString("base64"),
    durationSec: normalizedInfo.durationSec,
    normalized: true,
    wavInfo: normalizedInfo,
    cleanup,
  };
}

export function normalizeAvatarTimestamp(rawTimestamp: string | undefined, durationSec: number): string {
  const minTimestamp = 0.1;
  const maxTimestamp = Math.max(minTimestamp, durationSec - 0.05);
  const defaultTimestamp = Math.min(1.6, maxTimestamp);

  let value = Number(rawTimestamp);
  if (!Number.isFinite(value) || value <= 0) {
    value = defaultTimestamp;
  }

  if (value < minTimestamp) value = minTimestamp;
  if (value > maxTimestamp) value = maxTimestamp;

  return value.toFixed(3).replace(/\.?0+$/, "");
}
