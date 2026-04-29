# Prompt Templates

Use these templates as building blocks. Adapt them to the actual product brief instead of copying them blindly.

## 1. Poster Generation Prompt

```text
生成一张高完成度的{visual_style}产品宣传海报图，主角是{product_name}，这是一款面向{target_audience}的{product_category}。画面需要以产品本体为绝对视觉中心，清晰传达{three_second_message}这一核心印象，并突出{selling_points}这些卖点。整体气质应体现{brand_tone}，配色以{color_cues}为主，形成有冲击力但干净克制的视觉氛围。构图上请结合{composition_cues}，让主体突出、背景服务于主题，不要喧宾夺主。海报应具有清晰的标题区、副信息区和底部行动引导区域，适合放置醒目的品牌标题与简洁 CTA，如{cta}，并自然容纳{must_have_copy}这类短文案。避免出现{forbidden_elements}，避免过多密集小字，优先保证版面层级清楚、主体突出、商业感强、画面高级完整，整体呈现专业商业广告大片质感。
```

## 1A. Incremental Prompt Update Pattern

Use this after round 1. Internally update the brief incrementally, but rewrite the final image prompt as one coherent natural-language paragraph. Do not output checklist fragments to the image model.

```text
在上一版最佳海报 concept 的基础上做局部增强，不要推翻整个视觉概念。把需要保留的优势、需要修正的问题、以及不能退化的点，全部自然融入同一段图像描述里，而不是列成项目符号。新的段落需要继续明确主体、卖点、构图、色彩、标题区、CTA 区和整体商业海报质感。如果涉及中文文案，只保留大标题或极短副标题，并描述清晰的文字区域与留白，不要堆叠大量小字。
```

## 2. Reference Image Extraction Prompt

Use this with `mediaclaw_image_qa` when the user provides a brand board, existing poster, logo sheet, or product reference image.

```text
请分析这张参考图，并只提取适合用于“产品宣传海报文生图提示词”的信息。

输出 JSON，包含：
- subject_description
- color_palette
- visual_style
- composition_cues
- brand_tone
- must_avoid

不要复述无关细节，不要输出长篇解释。
```

## 3. Poster Review Prompt

Use this with `mediaclaw_image_qa` in `general` mode. Force JSON only.

```text
你是产品营销海报评审。请按照固定评分表对这张海报打分，并只输出合法 JSON。

评分规则：
- 总分 100
- 每项先按 10 分制打分
- 加权分 = score_10 * weight / 10
- 通过条件：total_score >= 75，且以下关键项都 >= 7/10：
  - 卖点清晰度
  - 主视觉吸引力
  - 产品主体突出度
  - 信息层级与可读性

评分项与权重：
- 卖点清晰度: 20
- 主视觉吸引力: 20
- 产品主体突出度: 15
- 品牌一致性: 15
- 信息层级与可读性: 15
- 转化意图与行动号召: 15

请输出：
{
  "items": [
    {
      "name": "卖点清晰度",
      "weight": 20,
      "score_10": 0,
      "weighted_score": 0,
      "passed": false,
      "comment": "一句话短评"
    }
  ],
  "total_score": 0,
  "passed": false,
  "key_failures": ["最低分关键项名称"],
  "strengths": ["表现最好的1-2项"],
  "weaknesses": ["最弱的1-3项"],
  "improvements_vs_previous": ["相对上一轮提升的点"],
  "regressions_vs_best": ["相对历史最佳退化的点"],
  "replace_best": false,
  "followup_questions": [
    "用于补足低分项的具体问题1",
    "用于补足低分项的具体问题2"
  ],
  "summary": "一句话总结"
}

要求：
1. followup_questions 只保留最关键的 2-4 个问题。
2. 问题必须具体，能够直接改善下一轮出图，且默认只围绕 1-2 个最低分项。
3. 如果海报已经通过，也保留空数组或极少量可选建议。
4. 只输出 JSON，不要输出 Markdown，不要输出额外说明。
5. 如果当前图只是在中文小字、按钮微文案上不稳定，但底图、主体、卖点、层级都更好，不要因此夸大整体退化。
```

## 4. Stronger Intake Prompt After Three Failed Rounds

Use this wording when the loop has failed 3 times and the user still wants to continue.

```text
为了更快把海报拉到通过线，请直接补这 6 项：
1. 目标人群是谁
2. 最重要的 3 个卖点
3. 你最想让用户 3 秒内记住的一句话
4. 想要的风格或参考方向
5. 希望突出哪些颜色
6. 绝对不要出现什么元素
```

## 5. Score Table Template

Render the review result like this:

```markdown
| 评分项 | 权重 | 10分制得分 | 加权分 | 是否达标 | 简评 |
| --- | ---: | ---: | ---: | --- | --- |
| 卖点清晰度 | 20 | 8 | 16 | 是 | 卖点能快速理解，但还可再聚焦 |
| 主视觉吸引力 | 20 | 7 | 14 | 是 | 有海报感，但冲击力可更强 |

总分：84/100
结论：通过
优势：卖点清晰、主体突出
待优化：品牌一致性
历史最佳：84/100
本轮变化：+2.0
本轮 Prompt 摘要：强化 CTA，保持主体居中和联通红主色
本轮新增优化点：CTA 更明确、文字区更集中
本轮保留优势：卖点清晰、主体突出
总分趋势：72 -> 73.5 -> 65.5
历史最佳：73.5（Round 2）
```

## 6. Tool Process Display Template

Show the process in the dialog like this before each round runs:

````markdown
步骤 1：整理海报生成简报
步骤 2：调用 `mediaclaw_text_to_image` 生成海报

本轮文生图 Prompt：
```text
{full_prompt}
```

步骤 3：调用 `mediaclaw_image_qa` 进行评分
````

For later rounds, replace the header with:

```text
第 {round_number} 轮优化：根据评分结果重新生成海报
```

If the round regresses, print this after scoring:

```text
本轮发生回退，已保留历史最佳版本继续优化。
本轮 prompt 未被采纳，已回退到历史最佳 prompt。
```

If there are 2 or more rounds, also print:

```text
总分趋势：72 -> 73.5 -> 65.5
历史最佳：73.5（Round 2）
```

## 7. Follow-up Question Pattern

When a poster fails, keep the follow-up concise:

```text
这版还没过线，主要卡在：{weaknesses}。

请补充下面 2-4 点，我用它重做下一版：
- {question_1}
- {question_2}
- {question_3}
```

## 8. Final Trend Chart Template

If there are 2 or more scored rounds, show a single final total-score chart in the last round dialog:

````markdown
## Final Score Trend

%%{init: {"theme":"base","themeVariables":{"primaryColor":"#d92d20","lineColor":"#d92d20","fontFamily":"\"Segoe UI\", \"PingFang SC\", sans-serif","fontSize":"14px","xyChart":{"backgroundColor":"#fffaf8","titleColor":"#7a271a"}}}}%%
```mermaid
xychart-beta
  title "Poster Score Trend"
  x-axis ["Round 1", "Round 2", "Round 3"]
  y-axis "Total Score" 0 --> 100
  line [72, 73.5, 65.5]
```

- 总分趋势: 72 -> 73.5 -> 65.5
- 历史最佳轮次: Round 2
- 最终最佳分数: 73.5
````
