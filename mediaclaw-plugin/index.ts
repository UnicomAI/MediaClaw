import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { ClientManager } from "./src/api/client-manager.js";
import { registerTextToImage } from "./src/tools/text-to-image.js";
import { registerImageQA } from "./src/tools/image-qa.js";
import { registerTextToVideo } from "./src/tools/text-to-video.js";
import { registerImageToVideo } from "./src/tools/image-to-video.js";
import { registerImagesToVideo } from "./src/tools/images-to-video.js";
import { registerTextToSpeech } from "./src/tools/text-to-speech.js";
import { registerSpeechRecognition } from "./src/tools/speech-recognition.js";
import { registerDigitalAvatar } from "./src/tools/digital-avatar.js";
import { registerBurnSubtitles } from "./src/tools/burn-subtitles.js";
import { registerBuildSrt, registerMergeSrt } from "./src/tools/build-srt.js";
import { registerReplaceBackground } from "./src/tools/replace-background.js";
import { registerApplyGrade } from "./src/tools/apply-grade.js";
import { registerNormalizeAudio } from "./src/tools/normalize-audio.js";
import { registerApplyOverlay } from "./src/tools/apply-overlay.js";
// import { registerLocalImage } from "./src/tools/local-image.js";

let hasLoggedInit = false;

export default definePluginEntry({
  id: "mediaclaw",
  name: "MediaClaw",
  description: "元景多模态团队提供的媒体生成：文生图、图文问答、文生视频。支持 yuanjing 和 sglang 两种提供商，可灵活配置每个能力使用的提供商。",
  register(api) {
    const rawConfig = api.pluginConfig;

    // 创建客户端管理器（内部处理配置标准化）
    const manager = new ClientManager(rawConfig);
    const config = manager.getConfig();

    if (!hasLoggedInit) {
      const providers = manager.getConfiguredProviders();
      const defaultProvider = config.defaultProvider;
      const capabilities = config.capabilities;
      const capOverrides = Object.keys(capabilities).length > 0
        ? `, overrides: ${JSON.stringify(capabilities)}`
        : "";
      console.log(
        `[MediaClaw] 初始化: providers=[${providers.join(", ")}], default=${defaultProvider}${capOverrides}`
      );
      hasLoggedInit = true;
    }

    // 检查必要配置
    if (!manager.hasProvider("yuanjing") && !manager.hasProvider("sglang")) {
      console.warn("[MediaClaw] Warning: No provider configured. Please configure providers.yuanjing or providers.sglang");
    }

    // 注册工具，传入 manager 而非 client
    api.registerTool(registerTextToImage(manager, config.outputDir));
    api.registerTool(registerImageQA(manager));
    api.registerTool(registerTextToVideo(manager, config.outputDir, config.videoPollInterval, config.videoMaxWaitTime));
    api.registerTool(registerImageToVideo(manager, config.outputDir, config.videoPollInterval, config.videoMaxWaitTime));
    api.registerTool(registerImagesToVideo(manager, config.outputDir, config.videoPollInterval, config.videoMaxWaitTime));
    api.registerTool(registerTextToSpeech(manager, config.outputDir));
    api.registerTool(registerSpeechRecognition(manager));
    api.registerTool(registerDigitalAvatar(manager, config.outputDir, config.videoPollInterval, config.videoMaxWaitTime));

    // 本地处理工具（无需提供商）
    api.registerTool(registerBurnSubtitles(config.outputDir));
    api.registerTool(registerBuildSrt(config.outputDir));
    api.registerTool(registerMergeSrt(config.outputDir));
    api.registerTool(registerReplaceBackground(config.outputDir));
    api.registerTool(registerApplyGrade(config.outputDir));
    api.registerTool(registerNormalizeAudio(config.outputDir));
    api.registerTool(registerApplyOverlay(config.outputDir));
    // api.registerTool(registerLocalImage());
  },
});
