---
name: unicom-product-poster
description: Generate product promotional posters with MediaClaw and iteratively refine them through a fixed marketing scorecard. Use when a user asks for a product poster, promo visual, campaign poster, marketing KV, or product promotion image and wants a generate-review-improve loop instead of a one-shot image.
---

# Unicom Product Poster

Turn a rough product description into a promotional poster, score it against a fixed marketing rubric, and keep improving it until it passes or the user stops.

This skill is for product marketing posters, campaign key visuals, promo images, product launch posters, and sales enablement hero visuals. It is not for long video, avatar, or subtitle workflows.

## Required Tools

- `mediaclaw_text_to_image`
- `mediaclaw_image_qa`

If either tool is unavailable, stop and tell the user the skill cannot continue.

## Defaults

Use these defaults unless the user overrides them:

- goal: product promotional poster
- aspect ratio: `3:4`
- style: commercial marketing poster
- generated images per round: `1`
- pass line: total score `>= 75/100`
- key dimensions must be `>= 7/10`

Key dimensions:

- 卖点清晰度
- 主视觉吸引力
- 产品主体突出度
- 信息层级与可读性

Read the fixed review rubric from [references/poster-review-rubric.md](references/poster-review-rubric.md).
Read reusable prompt patterns from [references/prompt-templates.md](references/prompt-templates.md).

## Stability Policy

This skill must optimize conservatively. Do not treat each new round as a blank-sheet rewrite.

Maintain a `best_so_far` state after every scored round. Record at least:

- best image path
- best total score
- best prompt
- best score table
- locked strengths that must not regress

Use this replacement rule:

- replace `best_so_far` only when total score is higher
- if total score is tied, replace only when key dimensions are stronger or more stable

If a new round scores lower than `best_so_far`:

- explicitly mark it as a regression
- keep `best_so_far` as the active baseline
- continue future optimization from the best prompt and best brief, not from the regressed round

Never silently overwrite a stronger earlier round with a weaker later round.

## Conversation Visibility

The dialog must show the tool-usage process. Do not hide the workflow behind silent execution.

Before every tool call, print a short step marker telling the user:

- which tool is about to be called
- what the tool is being used for in this round

At minimum, show:

- `步骤 1：整理海报生成简报`
- `步骤 2：调用 mediaclaw_text_to_image 生成海报`
- `步骤 3：调用 mediaclaw_image_qa 进行评分`
- `历史最佳分数`
- `本轮分数`
- `是否回退到最佳版`

When entering a refinement round, show the round number, for example:

- `第 2 轮优化：根据评分结果重新生成海报`

Before every `mediaclaw_text_to_image` call, print the full final prompt in the dialog exactly as it will be sent. Use a fenced code block with the `text` info string.

Use this format:

````text
本轮文生图 Prompt：
```text
{full_prompt}
```
````

Do not summarize or truncate the prompt. Print the full prompt every round, including regenerated rounds.

After every scoring round, show a short trend block with:

- historical best score
- current round score
- score delta vs best
- whether the current prompt was adopted or rolled back

If there are 2 or more scored rounds, also show a lightweight trend summary in the dialog:

- `总分趋势：72 -> 73.5 -> 65.5`
- `历史最佳：73.5（Round 2）`

Prefer lightweight symbols when useful:

- rising: `↑`
- falling: `↓`
- unchanged: `→`

Do not print or save per-round report paths.

## Input Strategy

Ask only for the product introduction first if the user has not given one.

Absorb optional details when the user provides them:

- brand name
- target audience
- core selling points
- required slogan or copy
- preferred style
- preferred colors
- aspect ratio or orientation
- forbidden elements
- reference images

Do not open with a long questionnaire. Collect missing information only when the review result shows it matters.

If the user provides a reference image, logo, or existing poster, first use `mediaclaw_image_qa` to extract usable design constraints, then fold those constraints into the next text-to-image prompt. Do not promise pixel-perfect logo reproduction from a text-only image generation flow.

If the user asks for a lot of Chinese copy inside the generated image, warn them early:

- generated Chinese headlines can work as large, short copy
- dense Chinese body text, button copy, or exact brand subtitles are unstable
- the safest target is a strong poster base image plus a layout that can accept later text overlay

## Workflow

### 1. Build the poster brief

Normalize the request into a brief with these fields:

- product name
- product category
- target audience
- core selling points
- must-have copy
- desired tone
- visual style
- color cues
- aspect ratio
- forbidden elements
- success emphasis
- text rendering priority

Fill missing values with reasonable defaults:

- target audience: broad consumer audience unless the user specifies otherwise
- desired tone: confident, premium, conversion-oriented
- visual style: commercial marketing poster
- aspect ratio: `3:4`
- text rendering priority: prioritize strong base image and clean text zones over exact full-copy rendering

Map orientation requests:

- `竖版` -> `3:4`
- `横版` -> `16:9`
- `方图` -> `1:1`
- explicit ratio -> use exactly what the user requested

### 2. Generate the first poster

Use the text-to-image template from `references/prompt-templates.md`.

Internally keep the structured brief for reasoning, comparison, scoring, and follow-up questions. However, the final prompt sent to `mediaclaw_text_to_image` must be compressed into one coherent natural-language paragraph.

Before calling the tool:

- print the current round number
- announce the `mediaclaw_text_to_image` call
- print the complete final prompt

Call `mediaclaw_text_to_image` with:

- `prompt`: the generated poster prompt
- `size`: the chosen aspect ratio
- `n`: `1`
- `model`: default model unless the user explicitly asks for another supported model

Keep prompts concrete. Always include:

- product subject
- target audience
- main selling point
- visual hierarchy
- CTA intent
- palette cues
- composition cues
- restrictions or banned elements

Prompt-shape rule for poster generation:

- the final prompt must be one paragraph of natural language
- it may wrap across lines for readability, but it must not be a field-by-field checklist
- do not send prompt text that contains labels like `产品名称：`, `目标人群：`, `颜色偏好：`
- do not send numbered requirement blocks like `生成要求：1. 2. 3.`
- start directly with the image task, for example `生成一张……海报图`
- describe the subject, selling point, composition, lighting, color, text zones, and overall commercial finish as one continuous image-oriented description
- allow one short closing sentence to reinforce quality, such as `整体呈现专业商业广告大片质感，画面干净，高级，具有明确海报版式。`

If the user wants Chinese brand copy, prefer these rules in the first prompt:

- keep the required in-image text short
- prioritize one large brand title and one short support line
- ask for clear text areas instead of many tiny text blocks
- do not force dense Chinese microcopy into the generated image

### 3. Score the poster

Before calling the tool:

- announce the `mediaclaw_image_qa` call
- explain that it is scoring the poster against the fixed review table

Call `mediaclaw_image_qa` in `general` mode with the generated poster and the review prompt from `references/prompt-templates.md`.

Require JSON-only output with at least:

- `items`: array of scored rows
- `total_score`
- `passed`
- `key_failures`
- `followup_questions`
- `summary`

Each scoring row must include:

- `name`
- `weight`
- `score_10`
- `weighted_score`
- `passed`
- `comment`

Do not trust the tool's pass/fail verdict blindly. Recompute the final result yourself:

- total score must be `>= 75`
- every key dimension must be `>= 7/10`

If the JSON verdict disagrees with the numbers, use the numbers.

Also extract or derive:

- strongest dimensions
- weakest dimensions
- improvements vs the previous round
- regressions vs `best_so_far`
- whether the current round should replace `best_so_far`

### 4. Visualize the review

Render the scorecard as a Markdown table with these columns:

- 评分项
- 权重
- 10分制得分
- 加权分
- 是否达标
- 简评

Then show:

- total score
- pass or fail
- the 1-2 strongest dimensions
- the 1-3 weakest dimensions
- historical best score
- current score delta vs historical best
- whether the current round was kept or rolled back
- prompt summary
- new optimization targets
- preserved strengths
- multi-round trend summary when applicable

Keep the table user-facing and readable. Do not expose raw API payloads.

The prompt summary must be short and structured. Include:

- `本轮 Prompt 摘要`
- `本轮新增优化点`
- `本轮保留优势`

When there are 2 or more scored rounds, also include:

- `总分趋势`
- `历史最佳`
- final total-score trend chart in the last round dialog only

If the current round regresses, explicitly print:

- `本轮 prompt 未被采纳，已回退到历史最佳 prompt`

Do not save per-round reports or a final report.

If there is only 1 scored round, do not fabricate a trend chart. Write `当前仅 1 轮，暂无趋势图`.

When there are 2 or more scored rounds, generate a single final total-score Mermaid line chart only in the last round dialog.

Use Mermaid for that final chart. Keep it visually clean and presentation-friendly.

### 5. Run the refinement loop

If the poster fails:

- ask only the 2-4 most useful follow-up questions
- base the questions on the lowest-scoring dimensions
- target only 1-2 weakest dimensions in the next generation round
- avoid generic questions like "请更详细一点"
- explain briefly what is missing and why it blocks a better poster

Prompt update policy:

- do not rewrite the full concept from scratch after round 1
- edit the best prompt incrementally
- explicitly preserve already-passing strengths
- explicitly forbid regression on previously strong dimensions
- keep the final output prompt in one-paragraph natural language even after incremental updates
- merge new targets into scene and layout description instead of appending checklist-style notes

If any of these dimensions passed in the current best round, the next prompt must explicitly preserve them:

- 卖点清晰度
- 品牌一致性
- 产品主体突出度
- 信息层级与可读性

Question targeting rules:

- low `卖点清晰度`: ask for the primary benefit, differentiator, and what must be understood in 3 seconds
- low `主视觉吸引力`: ask for desired mood, premium vs youthful vs tech tone, and whether to emphasize realism or stylization
- low `产品主体突出度`: ask which product form, angle, packaging, or hero object must dominate the frame
- low `品牌一致性`: ask for brand color, brand personality, and required brand words
- low `信息层级与可读性`: ask for the single headline, the supporting copy, and whether minimal or information-rich layout is preferred
- low `转化意图与行动号召`: ask for the intended action, channel, and urgency message

After new user input arrives:

- merge the new information into the brief
- update the best prompt incrementally instead of rewriting it wholesale
- regenerate the poster from the best baseline
- rescore it
- show the updated table
- again print the full text-to-image prompt before regeneration

After each failed round:

- compare the new round with `best_so_far`
- if worse, roll back to `best_so_far`
- if better, promote it to the new `best_so_far`

After 3 failed rounds, switch to a stronger intake mode. Ask for a compact structured brief covering:

- target audience
- top 3 selling points
- headline
- desired style
- required colors
- banned elements

If the user declines to continue, stop the loop and clearly state that the current poster did not pass the scorecard.

Do not keep free-exploring after 3 failed rounds without new structured information from the user.

## Delivery Rules

When the poster passes:

- return the final best poster image path with a `MEDIA:` prefix
- add one short line explaining why it passed
- keep the final delivery compact

If there were multiple rounds, also show the final total-score trend chart in the dialog before the final delivery line.

Use this format:

```text
评分通过（75分及以上，卖点清晰、主体突出、版式可读）。
MEDIA:/absolute/path/to/poster.png
```

When the poster does not pass and the user stops:

- return the latest accepted best image path
- say it is not yet scorecard-approved
- do not pretend it passed

## Guardrails

- Do not generate multiple branches by default.
- Do not ask more than 4 questions in one iteration.
- Do not rewrite the entire prompt when only one local weakness needs correction.
- Do not keep optimizing from a regressed round.
- Do not fabricate trend data when there is only 1 round or when a metric is missing.
- Do not claim exact typography fidelity for small text rendered inside generated images.
- Do not over-penalize the entire poster because tiny Chinese text is imperfect; treat text exactness as a note unless the user's primary goal is text fidelity.
- If the user supplies reference images, use them to extract constraints with `mediaclaw_image_qa`, not as direct image generation inputs.
