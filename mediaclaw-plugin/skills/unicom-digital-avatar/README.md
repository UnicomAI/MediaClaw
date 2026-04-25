# unicom-digital-avatar

联通元景数字人生成 Skill，覆盖语音合成、数字人视频生成、背景替换与字幕烧录。

## 依赖

- `mediaclaw` 插件（`interface=yuanjing`）
- `ffmpeg`（用于背景替换与字幕烧录）

## 典型流程

1. `mediaclaw_text_to_speech` 生成语音
2. `mediaclaw_digital_avatar` 生成数字人视频
3. `mediaclaw_replace_background` 进行绿幕换背景（可选）
4. `mediaclaw_burn_subtitles` 烧录字幕（可选）
