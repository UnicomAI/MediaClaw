import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function writeWavHeader(
  dataLength: number,
  sampleRate: number = 22050,
  channels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const fileSize = 36 + dataLength;

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate: number = 22050,
  channels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const header = writeWavHeader(pcmBuffer.length, sampleRate, channels, bitsPerSample);
  return Buffer.concat([header, pcmBuffer]);
}

export function imageToBase64(imagePath: string): string {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`图片文件不存在: ${imagePath}`);
  }
  const buffer = fs.readFileSync(imagePath);
  return buffer.toString("base64");
}

export function imageToBase64DataUrl(imagePath: string): string {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`图片文件不存在: ${imagePath}`);
  }

  const ext = path.extname(imagePath).toLowerCase().slice(1);
  const validExts = ["jpg", "jpeg", "png", "gif", "bmp", "webp"];
  const imgFormat = validExts.includes(ext) ? ext : "jpeg";

  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString("base64");
  return `data:image/${imgFormat};base64,${base64}`;
}

export function saveBase64Image(base64Data: string, outputPath: string): void {
  const buffer = Buffer.from(base64Data, "base64");
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, buffer);
}

export function saveBase64Video(base64Data: string, outputPath: string): void {
  const buffer = Buffer.from(base64Data, "base64");
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, buffer);
}

export function saveArrayBufferVideo(data: ArrayBuffer, outputPath: string): void {
  const buffer = Buffer.from(data);
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, buffer);
}

export function saveAudioBuffer(buffer: Buffer, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, buffer);
}

export function generateImageOutputPath(prompt: string, index: number = 0, outputDir?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safePrompt = prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 20);
  const filename = index > 0
    ? `mediaclaw_t2i_${safePrompt}_${timestamp}_${index}.png`
    : `mediaclaw_t2i_${safePrompt}_${timestamp}.png`;

  if (outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    return path.resolve(outputDir, filename);
  }
  return path.resolve(os.tmpdir(), filename);
}

export function generateVideoOutputPath(
  prompt: string,
  prefix: string = "mediaclaw_video",
  outputDir?: string,
  suffix?: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safePrompt = prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 20);
  const baseName = `${prefix}_${safePrompt}_${timestamp}`;
  const filename = suffix ? `${baseName}_${suffix}.mp4` : `${baseName}.mp4`;

  if (outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    return path.resolve(outputDir, filename);
  }
  return path.resolve(os.tmpdir(), filename);
}

export function generateVideoOutputPathFromBaseName(
  baseName: string,
  prefix: string,
  outputDir?: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${prefix}_${baseName}_${timestamp}.mp4`;

  if (outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    return path.resolve(outputDir, filename);
  }
  return path.resolve(os.tmpdir(), filename);
}

export function generateAudioOutputPath(text: string, outputDir?: string, extension: string = "mp3"): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeText = text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 20);
  const filename = `mediaclaw_tts_${safeText}_${timestamp}.${extension}`;

  if (outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    return path.resolve(outputDir, filename);
  }
  return path.resolve(os.tmpdir(), filename);
}
