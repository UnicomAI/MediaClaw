import * as fs from "fs";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import { ToolResult, extractResourceId, CAPABILITY_SUPPORT } from "../api/types.js";
import { ClientManager, YuanjingClient } from "../api/index.js";
import { sleep } from "../utils/polling.js";
import { generateVideoOutputPath, saveBase64Video } from "../utils/file.js";
import { prepareDigitalAvatarAudio, normalizeAvatarTimestamp } from "../utils/audio.js";

export function registerDigitalAvatar(
  manager: ClientManager,
  outputDir?: string,
  defaultPollInterval: number = 5000,
  defaultMaxWaitTime: number = 300000
) {
  return {
    name: "mediaclaw_digital_avatar",
    description: "Generate a talking digital avatar video from an audio file. 注意：仅支持 yuanjing 接口。",
    parameters: Type.Object({
      audio_path: Type.String({ description: "Local path of the input audio file." }),
      avatar_id: Type.Optional(Type.String({
        description: "Avatar ID.",
        default: "male_lianxiaozheng_close",
      })),
      action_id: Type.Optional(Type.String({
        description: "Action ID.",
        default: "show_left",
      })),
      timestamp: Type.Optional(Type.String({
        description: "Action trigger timestamp.",
        default: "1.6",
      })),
      text: Type.Optional(Type.String({
        description: "Optional text used to generate subtitle output.",
      })),
      poll_interval: Type.Optional(Type.Number({
        description: "Polling interval in ms.",
        default: 5000,
      })),
      max_wait_time: Type.Optional(Type.Number({
        description: "Max wait time in ms.",
        default: 300000,
      })),
      save_subtitle: Type.Optional(Type.Boolean({
        description: "Whether to save subtitle file when returned.",
        default: true,
      })),
      output_dir: Type.Optional(Type.String({ description: "Output directory." })),
    }),
    async execute(_id: string, params: {
      audio_path: string;
      avatar_id?: string;
      action_id?: string;
      timestamp?: string;
      text?: string;
      poll_interval?: number;
      max_wait_time?: number;
      save_subtitle?: boolean;
      output_dir?: string;
    }): Promise<ToolResult> {
      // 验证能力是否可用
      if (!manager.isCapabilityAvailable("digitalAvatar")) {
        const supported = CAPABILITY_SUPPORT.digitalAvatar.join(", ");
        throw new Error(
          `数字人功能需要配置 yuanjing 提供商。支持的提供商: ${supported}\n` +
          `请在配置中添加 providers.yuanjing 配置项。`
        );
      }

      const client = manager.getClient("digitalAvatar");
      if (!(client instanceof YuanjingClient)) {
        throw new Error("Digital avatar is only available for provider=yuanjing.");
      }

      const audioPath = params.audio_path;
      if (!audioPath || !fs.existsSync(audioPath)) {
        throw new Error(`Audio file does not exist: ${audioPath}`);
      }

      const avatarId = params.avatar_id || "male_lianxiaozheng_close";
      const actionId = params.action_id || "show_left";
      const pollInterval = params.poll_interval || defaultPollInterval;
      const maxWaitTime = params.max_wait_time || defaultMaxWaitTime;
      const saveSubtitle = params.save_subtitle !== false;
      const outDir = params.output_dir || outputDir;

      const preparedAudio = await prepareDigitalAvatarAudio(audioPath);
      const timestamp = normalizeAvatarTimestamp(params.timestamp, preparedAudio.durationSec);
      if (preparedAudio.normalized) {
        console.log("[MediaClaw] Digital avatar audio normalized to mono 16-bit PCM WAV via ffmpeg");
      }
      if (params.timestamp && params.timestamp !== timestamp) {
        console.log(`[MediaClaw] Digital avatar timestamp adjusted from ${params.timestamp} to ${timestamp}`);
      }

      try {
        const submitResult = await client.submitDigitalAvatar(
          preparedAudio.audioBase64,
          avatarId,
          actionId,
          timestamp,
          params.text
        );

        if (submitResult.code !== 0) {
          const rawMessage = submitResult.msg || (submitResult as { message?: string }).message || JSON.stringify(submitResult);
          throw new Error(`Submit failed: ${rawMessage}`);
        }

        const resourceId = extractResourceId(submitResult);
        if (!resourceId) {
          throw new Error("Submit succeeded but resource id is missing.");
        }

        const start = Date.now();
        while (Date.now() - start < maxWaitTime) {
          await sleep(pollInterval);

          const result = await client.queryDigitalAvatarResult(resourceId);

          if (client.isDigitalAvatarFailed(result)) {
            throw new Error(`Digital avatar generation failed: ${JSON.stringify(result)}`);
          }

          if (!client.isDigitalAvatarCompleted(result)) {
            continue;
          }

          const contents: ToolResult["content"] = [];
          const videoB64 = client.extractDigitalAvatarVideo(result);
          const subtitle = client.extractDigitalAvatarSubtitle(result);

          if (!videoB64) {
            throw new Error("Digital avatar completed but video payload is missing.");
          }

          const videoPath = generateVideoOutputPath(
            params.text || path.basename(audioPath, path.extname(audioPath)),
            "mediaclaw_digital_avatar",
            outDir
          );
          saveBase64Video(videoB64, videoPath);
          contents.push({
            type: "text",
            text: `Digital avatar completed.\nVideo file: ${videoPath}`,
          });

          if (saveSubtitle && subtitle) {
            const subtitleFile = `mediaclaw_digital_avatar_subtitle_${Date.now()}.ass`;
            const subtitlePath = outDir ? path.resolve(outDir, subtitleFile) : path.resolve(subtitleFile);
            const subtitleDir = path.dirname(subtitlePath);
            if (!fs.existsSync(subtitleDir)) {
              fs.mkdirSync(subtitleDir, { recursive: true });
            }
            fs.writeFileSync(subtitlePath, subtitle, "utf8");
            contents.push({
              type: "text",
              text: `Subtitle file: ${subtitlePath}`,
            });
          }

          return { content: contents };
        }

        return {
          content: [{
            type: "text",
            text: `Digital avatar generation timed out after ${Math.round(maxWaitTime / 1000)} seconds.\nresource_id: ${resourceId}`,
          }],
        };
      } finally {
        preparedAudio.cleanup?.();
      }
    },
  };
}
