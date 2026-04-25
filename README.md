# MediaClaw Plugin

OpenClaw 媒体生成插件，支持 `yuanjing` 与 `sglang` 两种后端提供商，可灵活配置每个能力使用的提供商。

在 yuanjing 提供商下，文生视频和图生视频支持 **Wan 2.2** 和 **Kling V3** 两种模型，可灵活切换。

## 能力矩阵

| 功能 | 后端依赖 | yuanjing | sglang | 工具名 |
|------|----------|:--------:|:------:|--------|
| 文生图 | 需要 | ✅ | ✅ | `mediaclaw_text_to_image` |
| 图文问答 | 需要 | ✅ | ✅ | `mediaclaw_image_qa` |
| 文生视频 | 需要 | ✅ (Wan/Kling) | ✅ | `mediaclaw_text_to_video` |
| 单图生视频 | 需要 | ✅ (Wan风格化/Kling单图) | ✅ | `mediaclaw_image_to_video` |
| 多图/首尾帧生视频 | 需要 | ✅ (Wan多图/Kling首尾帧) | ❌ | `mediaclaw_images_to_video` |
| 文生语音 | 需要 | ✅ | ❌ | `mediaclaw_text_to_speech` |
| 数字人视频 | 需要 | ✅ | ❌ | `mediaclaw_digital_avatar` |
| 字幕烧录 | 不需要（本地 ffmpeg） | N/A | N/A | `mediaclaw_burn_subtitles` |
| 绿幕换背景 | 不需要（本地 ffmpeg） | N/A | N/A | `mediaclaw_replace_background` |
| 本地图片/视频 | 不需要（本地处理） | N/A | N/A | `mediaclaw_local_image` |

## 安装

```bash
openclaw plugins install ./mediaclaw-plugin --force
openclaw gateway restart
```

环境要求：
- Node.js 22+
- OpenClaw Gateway >= 2026.3.24-beta.2
- 使用 `mediaclaw_burn_subtitles` / `mediaclaw_replace_background` 需安装 `ffmpeg`

### 安装WebUI

WebUI修改自[OpenClaw-Admin](https://github.com/itq5/OpenClaw-Admin)，安装流程如下：

```bash
cd OpenClaw-Admin
npm install
npm run dev:all
```

然后打开 `http://localhost:3001/`


## 配置

### 快速示例

**默认用 yuanjing，文生图和文生视频用不同的 sglang 服务器：**
编辑openclaw.json，在plugins中新增mediaclaw相关的配置
```json
"plugins": {
    "mediaclaw": {
      "enabled": true,
      "config": {
        "providers": {
          "yuanjing": {
            "apiKey": "your-yuanjing-token",
            "baseUrl": "https://maas-api.ai-yuanjing.com"
          },
          "sglang": {
            "baseUrl": "http://sglang-default:30010",
            "apiKey": "default-key"
          }
        },
        "capabilities": {
          "textToVideo": {
            "provider": "yuanjing"
          }
        },
        "defaultProvider": "yuanjing"
      }
    },
  },
```

说明：
- 默认使用 yuanjing（`defaultProvider: "yuanjing"`）
- providers，是一个全局配置，capabilities.<name>.provider下可以选择全局配置中的任意一个,可以覆盖全局配置，默认不配置时全部使用yuanjing

### Kling 视频模型配置

在 yuanjing 提供商下，可通过 `videoModel` 选择使用 Wan 或 Kling 模型。`provider` 字段可选，默认为 `yuanjing`。

**简化写法（只指定模型）：**
```json
{
  "providers": {
    "yuanjing": { "apiKey": "your-yuanjing-key" }
  },
  "capabilities": {
    "textToVideo": { "videoModel": "kling" },
    "imageToVideo": { "videoModel": "kling" },
    "imagesToVideo": { "videoModel": "kling" }
  }
}
```

**完整写法（指定提供商和模型）：**
```json
{
  "providers": {
    "yuanjing": { "apiKey": "your-yuanjing-key" }
  },
  "capabilities": {
    "textToVideo": {
      "provider": "yuanjing",
      "videoModel": "kling"
    },
    "imageToVideo": {
      "provider": "yuanjing",
      "videoModel": "kling"
    },
    "imagesToVideo": {
      "provider": "yuanjing",
      "videoModel": "kling"
    }
  }
}
```

**视频类模型选项：**
- `wan` - Wan 2.2 模型（默认）
- `kling` - Kling V3 模型（高品质视频）

**工具边界说明：**
- `image_to_video`：单图生视频（Wan 风格化 或 Kling 单图）
- `images_to_video`：多图/首尾帧生视频（Wan 多图 或 Kling 首尾帧）

### 参数说明

| 参数 | 说明 |
|------|------|
| `providers.yuanjing.apiKey` | 元景 API Key（必填） |
| `providers.yuanjing.baseUrl` | 元景 API Base URL |
| `providers.sglang.baseUrl` | SGLang 服务地址 |
| `providers.sglang.apiKey` | SGLang API Key |
| `providers.sglang.apiPath` | API 路径前缀 |
| `capabilities` | 指定能力用哪个提供商，支持：`textToImage`、`textToVideo`、`imageToVideo`、`imagesToVideo`、`imageQA`、`textToSpeech`、`digitalAvatar` |
| `capabilities.<name>.videoModel` | yuanjing 提供商下指定视频模型：`wan` 或 `kling` |
| `defaultProvider` | 未指定能力使用的默认提供商 |
| `outputDir` | 输出目录 |
| `videoPollInterval` | 轮询间隔(ms)，默认 5000 |
| `videoMaxWaitTime` | 最大等待时间(ms)，默认 300000 |

## SGLang Vision（图文问答）

`mediaclaw_image_qa` 在 `sglang` 模式下使用 OpenAI 兼容 Vision 接口：

- `POST /chat/completions`

兼容两类路径：

- `/v1/chat/completions`
- `/openapi/v1/web_control/chat/completions`

配置建议：

- 如果 `baseUrl` 已包含 `/openapi/v1/web_control`，则 `apiPath` 设为空。
- 如果 `baseUrl` 仅为主机地址（如 `http://127.0.0.1:30010`），则 `apiPath` 设为 `/v1`。


## Skills

### 长视频生成
- `skills/unicom-longvideo/SKILL.md`

### 数字人制作
- `skills/unicom-digital-avatar/SKILL.md`
