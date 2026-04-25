# AVATAR 文件格式

## 文件命名规则

**格式：`AVATAR-<人物名字>-<音色>.md`

示例：
- `AVATAR-联小颖-联小颖.md`
- `AVATAR-联小正-联小霸.md`

---

## 文件结构

```markdown
# Avatar: <名字>

## Appearance（可选，用于描述）
- 数字人外观描述（自然语言）

## Voice（可选，用于描述）
- 声音描述（自然语言）

## Preferences（必填）
- Avatar ID: <avatar_id>
- Speaker ID: <speaker_id>
- Style: casual | professional | news
- Burn Subtitles: true | false

## Last Used
- <日期>: <用途>
```

---

## 示例

### 示例 1：联小颖-联小颖

```markdown
# Avatar: 联小颖-联小颖

## Preferences
- Avatar ID: female_lianxiaoying_close
- Speaker ID: baker
- Style: professional
- Burn Subtitles: true

## Last Used
- 2026-04-20: 生成产品介绍视频
```

### 示例 2：联小正-联小霸

```markdown
# Avatar: 联小正-联小霸

## Preferences
- Avatar ID: male_lianxiaozheng_close
- Speaker ID: DBEM0514_M
- Style: news
- Burn Subtitles: false

## Last Used
- 2026-04-20: 新闻播报视频
```

---

## 使用规则

### 读取 AVATAR 文件
1. 在工作区根目录查找 `AVATAR-*-*.md`
2. 如果找到，读取 Preferences 部分
3. 预填充为默认值
4. 询问用户是否复用

### 更新 AVATAR 文件
1. 每次生成完成后，更新 Last Used 部分
2. 如果用户修改了偏好，更新 Preferences 部分
3. 不要覆盖用户手动添加的内容

### 多 AVATAR 文件
- 如果有多个 AVATAR 文件：
  1. 列出所有选项
  2. 让用户选择
  3. 或询问是否创建新的
