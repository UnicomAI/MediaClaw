// ============================================================================
// Interface Types
// ============================================================================

export type ProviderName = "yuanjing" | "sglang";

export interface YuanjingProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface SGLangProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  apiPath?: string;
}

// ============================================================================
// Capability Types
// ============================================================================

export type CapabilityName =
  | "textToImage"
  | "textToVideo"
  | "imageToVideo"
  | "imagesToVideo"
  | "imageQA"
  | "textToSpeech"
  | "digitalAvatar";

/**
 * 所有有效的能力名称列表
 */
export const VALID_CAPABILITY_NAMES: readonly CapabilityName[] = [
  "textToImage",
  "textToVideo",
  "imageToVideo",
  "imagesToVideo",
  "imageQA",
  "textToSpeech",
  "digitalAvatar",
] as const;

/**
 * 检查字符串是否为有效的能力名称
 */
export function isValidCapabilityName(name: string): name is CapabilityName {
  return VALID_CAPABILITY_NAMES.includes(name as CapabilityName);
}

/**
 * 所有有效的接口名称列表
 */
export const VALID_PROVIDER_NAMES: readonly ProviderName[] = ["yuanjing", "sglang"] as const;

/**
 * 检查字符串是否为有效的接口名称
 */
export function isValidProviderName(name: string): name is ProviderName {
  return VALID_PROVIDER_NAMES.includes(name as ProviderName);
}

/**
 * 能力与接口支持矩阵
 * 定义每个能力支持哪些接口
 */
export const CAPABILITY_SUPPORT: Record<CapabilityName, ProviderName[]> = {
  textToImage: ["yuanjing", "sglang"],
  textToVideo: ["yuanjing", "sglang"],
  imageToVideo: ["yuanjing", "sglang"],
  imagesToVideo: ["yuanjing"], // 仅 yuanjing
  imageQA: ["yuanjing", "sglang"],
  textToSpeech: ["yuanjing"], // 仅 yuanjing
  digitalAvatar: ["yuanjing"], // 仅 yuanjing
};

// ============================================================================
// Video Model Types (支持 wan/kling 模型选择)
// ============================================================================

/** 视频生成模型类型 */
export type VideoModelType = "wan" | "kling";

/** Kling 视频生成模式 */
export type KlingMode = "std" | "pro";

/** Kling 视频时长 */
export type KlingDuration = "5" | "10";

/** Kling 视频纵横比 */
export type KlingAspectRatio = "16:9" | "9:16" | "1:1";

/** Kling 声音开关 */
export type KlingSound = "on" | "off";

/** Kling 运镜类型 */
export type KlingCameraType = "simple" | "down_back" | "forward_up" | "right_turn_forward" | "left_turn_forward";

/** Kling 运镜配置 */
export interface KlingCameraControl {
  type?: KlingCameraType;
  config?: {
    horizontal?: number;
    vertical?: number;
    pan?: number;
    tilt?: number;
    roll?: number;
    zoom?: number;
  };
}

/** Kling T2V 请求参数 */
export interface KlingT2VParams {
  model_name?: "kling-v3-T2V" | string;
  prompt: string;
  negative_prompt?: string;
  sound?: KlingSound;
  cfg_scale?: number;
  mode?: KlingMode;
  camera_control?: KlingCameraControl;
  aspect_ratio?: KlingAspectRatio;
  duration?: KlingDuration;
  watermark_info?: Array<{ enabled: boolean }>;
  callback_url?: string;
  external_task_id?: string;
}

/** Kling I2V 请求参数 */
export interface KlingI2VParams {
  model_name?: "kling-v3-I2V" | string;
  image?: string;
  image_tail?: string;
  prompt?: string;
  negative_prompt?: string;
  voice_list?: Array<{ voice_id: string }>;
  sound?: KlingSound;
  cfg_scale?: number;
  mode?: KlingMode;
  static_mask?: string;
  dynamic_masks?: Array<{
    mask: string;
    trajectories?: Array<{ x: number; y: number }>;
  }>;
  camera_control?: KlingCameraControl;
  duration?: KlingDuration;
  watermark_info?: Array<{ enabled: boolean }>;
  callback_url?: string;
  external_task_id?: string;
}

/** Kling 任务状态 */
export type KlingTaskStatus = "submitted" | "processing" | "succeed" | "failed";

/** Kling 视频结果 */
export interface KlingVideo {
  id: string;
  url: string;
  watermark_url?: string;
  duration: string;
}

/** Kling 任务查询结果 */
export interface KlingTaskResult {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: KlingTaskStatus;
    task_status_msg?: string;
    task_info?: {
      external_task_id?: string;
    };
    task_result?: {
      videos?: KlingVideo[];
    };
    watermark_info?: {
      enabled: boolean;
    };
    final_unit_deduction?: string;
    created_at: number;
    updated_at: number;
  };
}

// ============================================================================
// Capability Config Types (支持能力级别独立端点配置)
// ============================================================================

/**
 * 能力完整配置：支持提供商选择和端点覆盖
 */
export interface CapabilityFullConfig {
  /** 提供商类型 */
  provider: ProviderName;
  /** 覆盖全局 sglang 配置（仅 provider=sglang 时有效） */
  sglang?: Partial<SGLangProviderConfig>;
  /** 覆盖全局 yuanjing 配置（仅 provider=yuanjing 时有效） */
  yuanjing?: Partial<YuanjingProviderConfig>;
  /** yuanjing 视频生成模型选择（仅 provider=yuanjing 且能力为 textToVideo/imageToVideo 时有效） */
  videoModel?: VideoModelType;
}

/**
 * 能力配置：支持简单字符串或完整对象
 * - 简单格式: "yuanjing" | "sglang"
 * - 完整格式: { provider: "sglang", sglang: { baseUrl: "..." } }
 */
export type CapabilityConfig = ProviderName | CapabilityFullConfig;

/**
 * 检查是否为完整配置对象
 */
export function isCapabilityFullConfig(
  config: CapabilityConfig
): config is CapabilityFullConfig {
  return typeof config === "object" && config !== null && "provider" in config;
}

/**
 * 将任意能力配置转换为完整格式
 */
export function normalizeCapabilityConfig(
  config: CapabilityConfig | undefined,
  providerName: ProviderName
): CapabilityFullConfig {
  if (!config) {
    return { provider: providerName };
  }
  if (isCapabilityFullConfig(config)) {
    return config;
  }
  // 简单字符串格式
  return { provider: config };
}

/**
 * 检查能力是否支持指定提供商
 */
export function isCapabilitySupported(
  capability: CapabilityName,
  providerName: ProviderName
): boolean {
  return CAPABILITY_SUPPORT[capability]?.includes(providerName) ?? false;
}

/**
 * 获取能力的默认提供商（第一个支持的提供商）
 */
export function getDefaultProviderForCapability(
  capability: CapabilityName
): ProviderName {
  return CAPABILITY_SUPPORT[capability]?.[0] ?? "yuanjing";
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * 新版配置格式：支持多提供商和灵活能力路由
 */
export interface MediaClawConfig {
  // 多提供商配置
  providers?: {
    yuanjing?: YuanjingProviderConfig;
    sglang?: SGLangProviderConfig;
  };

  // 能力路由配置：指定每个能力使用哪个提供商（支持简单字符串或完整对象）
  capabilities?: Partial<Record<CapabilityName, CapabilityConfig>>;

  // 默认提供商
  defaultProvider?: ProviderName;

  // 全局配置
  outputDir?: string;
  videoPollInterval?: number;
  videoMaxWaitTime?: number;

}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
  resource_id?: string;
  resourceId?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface TextToSpeechData {
  audio?: string | Buffer;
  audioFormat?: string;
  sampleRate?: number;
}

export interface TextToImageResult {
  b64_json?: string;
  url?: string;
}

export interface ImageQAResult {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface VideoSubmitResult {
  resource_id?: string;
  resourceId?: string;
  code: number;
  msg: string;
}

export interface VideoQueryResult {
  code: number;
  msg: string;
  video?: string;
  data?: {
    status?: string;
    video?: string;
  };
  result?: {
    video?: string;
  };
}

export interface DigitalAvatarQueryResult {
  code: number;
  message?: string;
  msg?: string;
  result?: {
    status?: string;
    video?: string;
    subtitle?: string;
  };
}

export interface ToolResult {
  content: Array<{
    type: "text" | "image";
    text?: string;
    data?: string;
    media_type?: string;
  }>;
}

export const SUPPORTED_SIZES: Record<string, string> = {
  "1:1": "1328x1328",
  "16:9": "1664x928",
  "9:16": "928x1664",
  "4:3": "1472x1104",
  "3:4": "1104x1472",
  "3:2": "1584x1056",
  "2:3": "1056x1584",
};

export function extractResourceId(response: ApiResponse): string | undefined {
  return response.resource_id || response.resourceId;
}

// ============================================================================
// Video Model Helpers
// ============================================================================

/** 有效的视频模型类型 */
export const VALID_VIDEO_MODEL_TYPES: readonly VideoModelType[] = ["wan", "kling"] as const;

/**
 * 检查是否为有效的视频模型类型
 */
export function isValidVideoModelType(model: string): model is VideoModelType {
  return VALID_VIDEO_MODEL_TYPES.includes(model as VideoModelType);
}

/**
 * 获取能力的默认视频模型
 */
export function getDefaultVideoModelForCapability(capability: CapabilityName): VideoModelType {
  return "wan"; // 默认使用 wan 模型，保持向后兼容
}

/**
 * Kling 视频模型名称常量
 */
export const KLING_MODELS = {
  T2V: "kling-v3-T2V",
  I2V: "kling-v3-I2V",
} as const;

/**
 * Kling API 路径
 */
export const KLING_API_PATHS = {
  EXECUTE: "/openapi/v1/model-providers/execute",
  TASKS: "/openapi/v1/model-providers/generations/tasks",
} as const;
