import { YuanjingClient } from "./yuanjing-client.js";
import { SGLangClient } from "./sglang-client.js";

export { YuanjingClient } from "./yuanjing-client.js";
export { SGLangClient } from "./sglang-client.js";
export { ClientManager, normalizeConfig } from "./client-manager.js";
export type { NormalizedConfig } from "./client-manager.js";
export * from "./types.js";

/**
 * 从能力配置中获取视频模型类型
 */
export function getVideoModelForCapability(
  config: { capabilities?: Partial<Record<string, any>> },
  capability: string
): "wan" | "kling" {
  const capConfig = config.capabilities?.[capability];
  if (capConfig && typeof capConfig === "object" && "videoModel" in capConfig) {
    return capConfig.videoModel === "kling" ? "kling" : "wan";
  }
  return "wan";
}

export type MediaClient = YuanjingClient | SGLangClient;
