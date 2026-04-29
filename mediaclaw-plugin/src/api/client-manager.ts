import {
  MediaClawConfig,
  ProviderName,
  CapabilityName,
  CapabilityFullConfig,
  CapabilityConfig,
  CAPABILITY_SUPPORT,
  isCapabilitySupported,
  getDefaultProviderForCapability,
  isCapabilityFullConfig,
  normalizeCapabilityConfig,
  YuanjingProviderConfig,
  SGLangProviderConfig,
  isValidCapabilityName,
  isValidProviderName,
  VALID_CAPABILITY_NAMES,
  VideoModelType,
  isValidVideoModelType,
  getDefaultVideoModelForCapability,
} from "./types.js";
import { YuanjingClient } from "./yuanjing-client.js";
import { SGLangClient } from "./sglang-client.js";

// 直接导入客户端类，避免循环导入
export type MediaClient = YuanjingClient | SGLangClient;

/**
 * 脱敏敏感信息（apiKey、token 等）
 */
function maskSensitive(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(maskSensitive);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("apikey") || lowerKey.includes("api_key") || lowerKey.includes("token") || lowerKey.includes("secret") || lowerKey.includes("password")) {
      result[key] = typeof value === "string" && value.length > 8 ? `${value.slice(0, 4)}****${value.slice(-4)}` : "****";
    } else {
      result[key] = maskSensitive(value);
    }
  }
  return result;
}

/**
 * 创建媒体客户端
 */
function createMediaClient(provider: ProviderName, config: YuanjingProviderConfig | SGLangProviderConfig): MediaClient {
  if (provider === "sglang") {
    return new SGLangClient(config as SGLangProviderConfig);
  }
  return new YuanjingClient(config as YuanjingProviderConfig);
}

/**
 * 标准化后的配置
 */
export interface NormalizedConfig {
  providers: {
    yuanjing?: YuanjingProviderConfig;
    sglang?: SGLangProviderConfig;
  };
  capabilities: Partial<Record<CapabilityName, CapabilityFullConfig>>;
  defaultProvider: ProviderName;
  outputDir?: string;
  videoPollInterval: number;
  videoMaxWaitTime: number;
}

/**
 * 检查 providers 配置是否有有效值
 */
function hasValidProviders(
  providers: NormalizedConfig["providers"] | undefined
): providers is NormalizedConfig["providers"] {
  if (!providers) return false;
  const yuanjing = providers.yuanjing;
  const sglang = providers.sglang;
  // 至少有一个提供商配置了必要的字段
  const hasYuanjing = !!(yuanjing && yuanjing.apiKey);
  const hasSglang = !!(sglang && (sglang.baseUrl || sglang.apiKey));
  return hasYuanjing || hasSglang;
}

/**
 * 标准化能力配置：将简单字符串转换为完整对象格式
 */
function normalizeCapabilities(
  capabilities: Partial<Record<CapabilityName, CapabilityConfig>> | undefined,
  defaultProvider: ProviderName
): Partial<Record<CapabilityName, CapabilityFullConfig>> {
  if (!capabilities) return {};

  const result: Partial<Record<CapabilityName, CapabilityFullConfig>> = {};
  for (const [key, config] of Object.entries(capabilities)) {
    // 校验能力名称是否有效
    if (!isValidCapabilityName(key)) {
      console.warn(
        `[MediaClaw] Unknown capability "${key}" in config. Valid capabilities: ${VALID_CAPABILITY_NAMES.join(", ")}`
      );
      continue; // 跳过无效的能力名称
    }
    const capability = key as CapabilityName;
    const normalized = normalizeCapabilityConfig(config, defaultProvider);

    // 校验 provider 值是否有效
    if (!isValidProviderName(normalized.provider)) {
      throw new Error(
        `[MediaClaw] Invalid provider "${normalized.provider}" for capability "${capability}". Valid values: yuanjing, sglang`
      );
    }

    result[capability] = normalized;
  }
  return result;
}

/**
 * 将配置标准化
 */
export function normalizeConfig(raw: Partial<MediaClawConfig>): NormalizedConfig {
  // 调试日志：打印配置（已脱敏）
  console.log('[MediaClaw] normalizeConfig raw:', JSON.stringify(maskSensitive(raw), null, 2));

  // 校验 defaultProvider 是否有效
  if (raw.defaultProvider && !isValidProviderName(raw.defaultProvider)) {
    throw new Error(
      `[MediaClaw] Invalid defaultProvider "${raw.defaultProvider}". Valid values: yuanjing, sglang`
    );
  }

  // 如果已经是新格式（有 providers 字段且包含有效配置），直接使用
  const rawProviders = raw.providers;
  console.log('[MediaClaw] rawProviders:', JSON.stringify(maskSensitive(rawProviders), null, 2));
  console.log('[MediaClaw] hasValidProviders:', hasValidProviders(rawProviders));

  if (hasValidProviders(rawProviders)) {
    const defaultProvider = raw.defaultProvider || detectDefaultProvider(rawProviders);
    return {
      providers: rawProviders!,
      capabilities: normalizeCapabilities(raw.capabilities, defaultProvider),
      defaultProvider,
      outputDir: raw.outputDir,
      videoPollInterval: raw.videoPollInterval ?? 5000,
      videoMaxWaitTime: raw.videoMaxWaitTime ?? 300000,
    };
  }

  console.error('[MediaClaw] hasValidProviders check failed');
  console.error('[MediaClaw] providers.yuanjing:', maskSensitive(raw?.providers?.yuanjing));
  console.error('[MediaClaw] providers.sglang:', maskSensitive(raw?.providers?.sglang));

  throw new Error(
    `[MediaClaw] No valid provider configured. ` +
      `Please provide either providers.yuanjing.apiKey or providers.sglang.baseUrl.`
  );
}

/**
 * 从配置的提供商中检测默认提供商
 */
function detectDefaultProvider(
  providers: NormalizedConfig["providers"]
): ProviderName {
  if (providers.yuanjing?.apiKey) {
    return "yuanjing";
  }
  if (providers.sglang?.baseUrl) {
    return "sglang";
  }
  return "yuanjing";
}

/**
 * 合并全局提供商配置和能力级别覆盖配置
 */
function mergeProviderConfig(
  globalConfig: YuanjingProviderConfig | SGLangProviderConfig,
  override: Partial<YuanjingProviderConfig> | Partial<SGLangProviderConfig> | undefined,
  providerName: ProviderName
): YuanjingProviderConfig | SGLangProviderConfig {
  if (!override) {
    return globalConfig;
  }

  if (providerName === "yuanjing") {
    const gc = globalConfig as YuanjingProviderConfig;
    const ov = override as Partial<YuanjingProviderConfig>;
    return {
      apiKey: ov.apiKey || gc.apiKey,
      baseUrl: ov.baseUrl ?? gc.baseUrl,
    };
  } else {
    const gc = globalConfig as SGLangProviderConfig;
    const ov = override as Partial<SGLangProviderConfig>;
    return {
      baseUrl: ov.baseUrl ?? gc.baseUrl,
      apiKey: ov.apiKey ?? gc.apiKey,
      apiPath: ov.apiPath ?? gc.apiPath,
    };
  }
}

/**
 * 解析后的能力配置（包含合并后的提供商配置）
 */
interface ResolvedCapabilityConfig {
  providerName: ProviderName;
  config: YuanjingProviderConfig | SGLangProviderConfig;
  hasOverride: boolean;
}

/**
 * 客户端管理器
 * - 管理多个提供商客户端（懒加载）
 * - 根据能力配置路由到正确的客户端
 * - 支持能力级别的端点覆盖
 * - 验证能力与提供商的兼容性
 */
export class ClientManager {
  private config: NormalizedConfig;
  private clients: Map<string, MediaClient> = new Map(); // key: `${providerName}:${configHash}`
  private capabilityCache: Map<CapabilityName, ResolvedCapabilityConfig> = new Map();

  constructor(rawConfig: Partial<MediaClawConfig>) {
    this.config = normalizeConfig(rawConfig);
    this.logInit();
  }

  private logInit(): void {
    const configuredProviders = Object.keys(this.config.providers).filter(
      (k) => this.config.providers[k as ProviderName]
    );
    const capOverrides = Object.entries(this.config.capabilities)
      .filter(([, v]) => v.sglang || v.yuanjing)
      .map(([k]) => k);
    const overrideInfo = capOverrides.length > 0 ? `, endpoint-overrides=[${capOverrides.join(", ")}]` : "";
    console.log(
      `[MediaClaw] ClientManager initialized: providers=[${configuredProviders.join(", ")}], default=${this.config.defaultProvider}${overrideInfo}`
    );
  }

  /**
   * 获取配置
   */
  getConfig(): NormalizedConfig {
    return this.config;
  }

  /**
   * 获取指定能力的客户端
   */
  getClient(capability: CapabilityName): MediaClient {
    const resolved = this.resolveCapabilityConfig(capability);
    return this.getOrCreateClient(resolved.providerName, resolved.config);
  }

  /**
   * 获取指定提供商的客户端（使用全局配置）
   */
  getClientByProvider(providerName: ProviderName): MediaClient {
    const config = this.config.providers[providerName];
    if (!config) {
      throw new Error(
        `[MediaClaw] Provider "${providerName}" is not configured. ` +
          `Available providers: ${this.getConfiguredProviders().join(", ") || "none"}`
      );
    }
    return this.getOrCreateClient(providerName, config);
  }

  /**
   * 解析能力配置（包含提供商选择和端点覆盖）
   */
  private resolveCapabilityConfig(capability: CapabilityName): ResolvedCapabilityConfig {
    // 使用缓存
    if (this.capabilityCache.has(capability)) {
      return this.capabilityCache.get(capability)!;
    }

    const capConfig = this.config.capabilities[capability];
    let providerName: ProviderName;
    let override: Partial<YuanjingProviderConfig> | Partial<SGLangProviderConfig> | undefined;
    let hasOverride = false;

    if (capConfig) {
      // 显式配置了该能力
      providerName = capConfig.provider;
      override = capConfig.sglang || capConfig.yuanjing;
      hasOverride = !!(override && Object.keys(override).length > 0);
      this.validateCapabilitySupport(capability, providerName);
    } else {
      // 使用默认提供商
      providerName = this.config.defaultProvider;
      if (!isCapabilitySupported(capability, providerName)) {
        // 默认提供商不支持该能力，使用 fallback
        providerName = getDefaultProviderForCapability(capability);
        console.warn(
          `[MediaClaw] Capability "${capability}" not supported by default provider "${this.config.defaultProvider}", falling back to "${providerName}"`
        );
      }
    }

    // 获取全局提供商配置
    const globalConfig = this.config.providers[providerName];
    if (!globalConfig) {
      throw new Error(
        `[MediaClaw] Provider "${providerName}" is not configured for capability "${capability}". ` +
          `Available providers: ${this.getConfiguredProviders().join(", ") || "none"}`
      );
    }

    // 合并全局配置和能力级别覆盖
    const mergedConfig = mergeProviderConfig(globalConfig, override, providerName);

    const result: ResolvedCapabilityConfig = {
      providerName,
      config: mergedConfig,
      hasOverride,
    };

    this.capabilityCache.set(capability, result);
    return result;
  }

  /**
   * 解析能力对应的提供商名称（公开方法）
   */
  resolveProvider(capability: CapabilityName): ProviderName {
    return this.resolveCapabilityConfig(capability).providerName;
  }

  /**
   * 懒加载客户端（支持能力级别的独立端点）
   */
  private getOrCreateClient(
    providerName: ProviderName,
    config: YuanjingProviderConfig | SGLangProviderConfig
  ): MediaClient {
    // 为每个唯一的配置创建独立的客户端
    const configKey = this.getClientKey(providerName, config);

    if (this.clients.has(configKey)) {
      return this.clients.get(configKey)!;
    }

    const client = createMediaClient(providerName, config);
    this.clients.set(configKey, client);

    if (configKey === providerName) {
      console.log(`[MediaClaw] Created client for provider: ${providerName}`);
    } else {
      console.log(`[MediaClaw] Created client with override: ${configKey}`);
    }

    return client;
  }

  /**
   * 生成客户端缓存 key
   */
  private getClientKey(
    providerName: ProviderName,
    config: YuanjingProviderConfig | SGLangProviderConfig
  ): string {
    if (providerName === "yuanjing") {
      const yc = config as YuanjingProviderConfig;
      const global = this.config.providers.yuanjing;
      // 如果与全局配置相同，使用简单 key
      if (global && yc.apiKey === global.apiKey && yc.baseUrl === global.baseUrl) {
        return providerName;
      }
      // 否则使用带 apiKey 后缀的 key
      return `${providerName}:${yc.apiKey?.slice(-8) || "default"}`;
    } else {
      const sc = config as SGLangProviderConfig;
      const global = this.config.providers.sglang;
      if (global && sc.baseUrl === global.baseUrl && sc.apiKey === global.apiKey && sc.apiPath === global.apiPath) {
        return providerName;
      }
      // 使用 baseUrl 后缀
      return `${providerName}:${sc.baseUrl || "default"}`;
    }
  }

  /**
   * 验证能力是否支持指定提供商
   */
  private validateCapabilitySupport(
    capability: CapabilityName,
    providerName: ProviderName
  ): void {
    if (!isCapabilitySupported(capability, providerName)) {
      const supported = CAPABILITY_SUPPORT[capability];
      throw new Error(
        `[MediaClaw] Capability "${capability}" is not supported by provider "${providerName}". ` +
          `Supported providers: ${supported.join(", ")}`
      );
    }
  }

  /**
   * 检查提供商是否已配置
   */
  hasProvider(providerName: ProviderName): boolean {
    return !!this.config.providers[providerName];
  }

  /**
   * 获取所有已配置的提供商
   */
  getConfiguredProviders(): ProviderName[] {
    return Object.keys(this.config.providers).filter(
      (k) => this.config.providers[k as ProviderName]
    ) as ProviderName[];
  }

  /**
   * 获取特定客户端类型（用于类型检查）
   */
  getYuanjingClient(): YuanjingClient | null {
    if (!this.hasProvider("yuanjing")) {
      return null;
    }
    const client = this.getClientByProvider("yuanjing");
    return client instanceof YuanjingClient ? client : null;
  }

  getSGLangClient(): SGLangClient | null {
    if (!this.hasProvider("sglang")) {
      return null;
    }
    const client = this.getClientByProvider("sglang");
    return client instanceof SGLangClient ? client : null;
  }

  /**
   * 检查能力是否可用（提供商已配置且支持）
   */
  isCapabilityAvailable(capability: CapabilityName): boolean {
    try {
      const resolved = this.resolveCapabilityConfig(capability);
      return this.hasProvider(resolved.providerName);
    } catch {
      return false;
    }
  }

  /**
   * 获取指定能力的视频模型类型（wan 或 kling）
   * 仅适用于 yuanjing 提供商的 textToVideo 和 imageToVideo 能力
   */
  getVideoModel(capability: CapabilityName): VideoModelType {
    const capConfig = this.config.capabilities[capability];
    if (capConfig && typeof capConfig === "object" && "videoModel" in capConfig) {
      const model = capConfig.videoModel;
      if (model && isValidVideoModelType(model)) {
        return model;
      }
      if (model) {
        console.warn(
          `[MediaClaw] Invalid videoModel "${model}" for capability "${capability}". Valid values: wan, kling. Using default.`
        );
      }
    }
    return getDefaultVideoModelForCapability(capability);
  }
}
