# 仓库协作指南

## 项目结构与模块组织
- `src/main.ts`：应用入口，注册 Pinia 与 Router。
- `src/views/**`：路由级页面，功能页使用 `*Page.vue` 命名。
- `src/components/layout`：布局壳组件；`src/components/common`：可复用通用组件。
- `src/stores`：Pinia 领域状态（auth、websocket、session、channel、config 等）。
- `src/api`：WebSocket/RPC 集成；共享类型位于 `src/api/types`。
- `src/composables` 与 `src/utils`：可复用逻辑与纯函数工具。
- `src/assets/styles/main.css`：全局样式；`public/`：静态资源。

## 构建、测试与开发命令
- `npm install`：安装依赖。
- `npm run dev`：启动 Vite 开发服务（`http://localhost:3001`）。
- `npm run build`：执行 `vue-tsc -b` 类型检查并产出 `dist/` 生产包。
- `npm run preview`：本地预览生产构建结果。

## 代码风格与命名规范
- 使用 Vue 3 Composition API + `<script setup lang="ts">`。
- 遵循现有格式：2 空格缩进、单引号、尾随逗号、无分号。
- `src` 路径优先使用 `@/` 别名导入。
- 命名约定：
  - 组件：`PascalCase.vue`
  - 路由页面：`*Page.vue`（例如 `SessionsPage.vue`）
  - store/composable/utils：简洁的小写或 camelCase 文件名（例如 `session.ts`、`useTheme.ts`）

## 测试要求
- 当前仓库尚未配置自动化测试框架。
- 合并前必须检查：
  - `npm run build` 通过，无类型与构建错误。
  - 针对改动流程做手工冒烟测试（登录、WebSocket 连接、相关页面），并连接可用 Gateway（`ws://127.0.0.1:18789`）。
- 对于非简单逻辑改动，请在 PR 中附测试计划；后续迭代优先补充 Vitest 单元测试。

## 提交与 PR 规范
- 提交前缀建议使用 Conventional Commit：`feat:`、`fix:`、`refactor:`、`docs:`、`chore:`。
- 每个提交只关注一个主题，避免占位式提交信息。
- PR 需包含：目标、关键改动、关联任务/Issue、验证步骤，以及 UI 改动截图/GIF。

## 安全与配置提示
- 禁止提交真实 Gateway Token、凭证或其他敏感信息。
- 运行时配置放在 `.env.development` / `.env.production`，新增 `VITE_` 变量需同步记录到 `README.md`。

## Codex 宪法（本仓库）
- 事实优先：先读现状再改代码；不得基于猜测修改 RPC、类型或页面行为。
- 单一来源：同一能力只保留一个权威入口与实现，避免页面与 store 双重定义。
- 兼容优先：优先适配现有 Gateway RPC 形态，不引入未经验证的新协议分支。
- 渐进改造：先打通最小闭环（可用），再做视觉与体验增强，避免一次性过度重构。
- 安全默认：凭证永不明文回显；未输入新值不得提交凭证 patch。
- 主题一致：样式优先复用全局变量（`--bg-*`、`--text-*`、`--border-color`），避免硬编码颜色。
- 渲染边界清晰：凡是 `v-html` 注入内容，若页面使用 `<style scoped>`，必须使用 `:deep(...)`（或改为非 scoped 受控样式）覆盖其内部元素；禁止误以为 scoped 选择器可直接命中运行时注入节点。
- 可验证：每次改动后至少保证可构建，并说明影响面与回归点。

## 实施教训（频道管理改造）
- 组件默认样式有“首项特例”（如 `Collapse` 的 first-child 规则），改间距前必须先核对组件源码。
- 间距系统必须“单机制”管理（统一使用 gap 或 margin），混用会造成首行/后续行视觉不一致。
- 暗色适配不能只改颜色值，应以主题变量驱动并限制选择器作用域，避免污染其他页面。
- 遇到“看起来像 spacing 问题”的异常，通常同时涉及 `margin/padding/border` 叠加，需要逐层排查。
- UI 微调应先保证信息架构不变，再收敛 spacing 与密度，避免视觉改善引发交互回归。
