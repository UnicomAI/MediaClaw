# Contributing

感谢你参与 OpenClaw Web。

## 开发环境

- Node.js >= 20
- npm >= 10

安装依赖：

```bash
npm install
```

启动开发：

```bash
npm run dev
```

生产构建检查：

```bash
npm run build
```

## 分支与提交建议

- 每个 PR 聚焦一个主题，避免混合大批量改动
- 推荐提交前缀：
  - `feat:` 新功能
  - `fix:` 缺陷修复
  - `refactor:` 重构
  - `docs:` 文档
  - `chore:` 工程杂项

## 代码规范

- Vue 3 Composition API + `<script setup lang="ts">`
- TypeScript strict 模式下通过构建
- 保持现有格式风格：2 空格缩进、单引号、无分号
- 新增逻辑优先复用 `stores` / `composables`，避免页面层复制逻辑

## 提交前检查

至少完成以下检查：

1. `npm run build` 通过
2. 影响功能完成基本手测（登录、对话、模型、Cron、记忆）
3. 若改动 UI，建议附截图

## Pull Request 内容建议

PR 描述建议包含：

- 变更目的
- 关键改动点
- 验证步骤
- 潜在影响范围

