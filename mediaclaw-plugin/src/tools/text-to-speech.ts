import { Type } from "@sinclair/typebox";
import { ToolResult, CAPABILITY_SUPPORT } from "../api/types.js";
import { ClientManager, YuanjingClient } from "../api/index.js";
import { generateAudioOutputPath, pcmToWav, saveAudioBuffer } from "../utils/file.js";

function isValidWav(buffer: Buffer): boolean {
  return (
    buffer.length >= 44 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

export function registerTextToSpeech(manager: ClientManager, outputDir?: string) {
  return {
    name: "mediaclaw_text_to_speech",
    description: "Text-to-speech (Yuanjing only). Convert text into speech audio. 注意：仅支持 yuanjing 接口。",
    parameters: Type.Object({
      text: Type.String({ description: "Text content to synthesize." }),
      speaker_id: Type.Optional(Type.String({
        description: "Speaker ID. Default: baker.",
        default: "baker",
      })),
      audio_format: Type.Optional(Type.String({
        description: "Audio format returned by the API.",
        enum: ["wave", "pcm"],
        default: "wave",
      })),
      sample_rate: Type.Optional(Type.Number({
        description: "Sample rate in Hz.",
        enum: [8000, 16000, 24000],
        default: 24000,
      })),
      energy: Type.Optional(Type.Number({
        description: "Voice energy scale.",
        default: 1.0,
      })),
      speed: Type.Optional(Type.Number({
        description: "Speech speed scale.",
        default: 1.0,
      })),
      output_dir: Type.Optional(Type.String({ description: "Output directory." })),
    }),
    async execute(_id: string, params: {
      text: string;
      speaker_id?: string;
      audio_format?: "wave" | "pcm";
      sample_rate?: 8000 | 16000 | 24000;
      energy?: number;
      speed?: number;
      output_dir?: string;
    }): Promise<ToolResult> {
      // 验证能力是否可用
      if (!manager.isCapabilityAvailable("textToSpeech")) {
        const supported = CAPABILITY_SUPPORT.textToSpeech.join(", ");
        throw new Error(
          `语音合成功能需要配置 yuanjing 提供商。支持的提供商: ${supported}\n` +
          `请在配置中添加 providers.yuanjing 配置项。`
        );
      }

      const client = manager.getClient("textToSpeech");
      if (!(client instanceof YuanjingClient)) {
        throw new Error("Text-to-speech is only available for provider=yuanjing.");
      }

      const text = params.text?.trim();
      if (!text) {
        throw new Error("text cannot be empty");
      }

      const outDir = params.output_dir || outputDir;
      const speakerID = params.speaker_id || "baker";

      const response = await client.textToSpeech(text, speakerID, {
        audioFormat: params.audio_format,
        sampleRate: params.sample_rate,
        energy: params.energy,
        speed: params.speed,
      });

      if (response.code !== 0 || !response.data?.audio) {
        throw new Error(`Text-to-speech failed: ${response.msg || "unknown error"}`);
      }

      const data = response.data;
      const audioPayload = data.audio;
      if (!audioPayload) {
        throw new Error("Text-to-speech response audio payload is empty");
      }

      let buffer = Buffer.isBuffer(audioPayload) ? audioPayload : Buffer.from(audioPayload, "base64");
      const sampleRate = data.sampleRate || params.sample_rate || 24000;
      const audioFormat = (data.audioFormat || params.audio_format || "wave").toLowerCase();

      let extension = audioFormat === "pcm" ? "pcm" : "wav";
      if (audioFormat === "pcm") {
        buffer = pcmToWav(buffer, sampleRate, 1, 16);
        extension = "wav";
      }

      if (extension === "wav" && !isValidWav(buffer)) {
        const preview = buffer.subarray(0, Math.min(32, buffer.length)).toString("utf8").replace(/\s+/g, " ").trim();
        throw new Error(`Text-to-speech returned invalid WAV payload. preview="${preview}"`);
      }

      const outputPath = generateAudioOutputPath(text, outDir, extension);
      saveAudioBuffer(buffer, outputPath);

      return {
        content: [{
          type: "text",
          text: `Text-to-speech completed.\nOutput file: ${outputPath}\nSample rate: ${sampleRate}`,
        }],
      };
    },
  };
}
