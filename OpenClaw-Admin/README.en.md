# Claw Admin - AI Agent Management Platform

<p align="center">
  <strong>Modern AI Agent Gateway Management Console</strong>
</p>

<p align="center">
  <a href="https://github.com/itq5/OpenClaw-Admin">GitHub</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#tech-stack">Tech Stack</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#hermes-agent-integration">Hermes Agent Integration</a> &bull;
  <a href="#project-structure">Project Structure</a> &bull;
  <a href="#development-guide">Development Guide</a> &bull;
  <a href="README.md">中文</a>
</p>

***

## Introduction

Claw Admin is a modern AI agent management platform built with Vue 3, supporting both **OpenClaw Gateway** and **Hermes Agent**. Through intuitive visual operations, users can easily manage AI agents, sessions, models, channels, skills, and other core features, with a full-featured Web CLI terminal experience.

### Version Compatibility

| OpenClaw Admin | OpenClaw Gateway | Hermes Agent | Status     |
| -------------- | ---------------- | ------------ | ---------- |
| 0.2.7          | 2026.4.5         | 2026.4.9     | ✅ Verified |

### Highlights

- 🎯 **Dual Gateway Support**: Manage both OpenClaw Gateway and Hermes Agent from a single platform
- 🖥️ **Web CLI Terminal**: Real CLI experience powered by xterm.js, with session persistence, reconnection, and launch parameter configuration
- 🤖 **Multi-Agent Collaboration**: Create and manage multiple AI agents for complex task collaboration
- 📊 **Real-time Monitoring**: System resources, session status, token usage, and more
- 🌍 **Internationalization**: Built-in Chinese and English support, seamless switching
- 🎨 **Modern UI**: Responsive design based on Naive UI, supports light/dark themes

***

## Features

### I. OpenClaw Gateway Module

#### Dashboard

![Dashboard](docs/images/仪表盘.png)

- Runtime overview and key metrics
- Token usage trend charts
- Session activity statistics
- Real-time event stream monitoring
- Top models/channels/tools distribution

#### Chat

![Chat](docs/images/在线对话.png)

- Real-time chat interface
- Support for slash commands (`/new`, `/skill`, `/model`, `/status`, `/subagents`)
- Message filtering and search
- Quick replies
- Real-time token usage statistics

#### Sessions

![Sessions](docs/images/会话管理.png)

- Session list and details
- Create, reset, delete sessions
- Multi-dimensional filtering and sorting
- Message history export

#### Memory

![Memory](docs/images/记忆管理.png)

- Agent document management
- Edit AGENTS, SOUL, IDENTITY, USER, and other core documents
- Markdown editor
- Quick template snippets

#### Cron

![Cron](docs/images/计划任务.png)

- Scheduled task creation and management
- Support for Cron expressions, fixed intervals, specific times
- Task execution history
- Quick templates (morning report, health check, etc.)

#### Models

![Models](docs/images/模型管理.png)

- Multi-model channel configuration
- API Key security management (masked display)
- Model probing
- Default model settings
- Coding package quick configuration

#### Channels

![Channels](docs/images/频道管理.png)

- QQ, Feishu, DingTalk, WeCom channel configuration
- Channel status monitoring
- Credential security management
- One-click installation and configuration

#### Skills

![Skills](docs/images/技能管理.png)

- Skill plugin list
- Built-in/user skill classification
- Skill installation and updates
- Chat visibility control

#### Agents

![Agents](docs/images/多智能体.png)

- Agent creation and management
- Identity, model, tool permission configuration
- Session statistics and token usage
- Workspace file management

#### Office

![Office-1](docs/images/智能体工坊-1.png)
![Office-2](docs/images/智能体工坊-2.png)

- Multi-agent collaboration space
- Scene creation wizard
- Task delegation and execution
- Inter-agent communication
- Team management

#### MyWorld

![MyWorld](docs/images/虚拟公司.png)

- Visual office scenes
- Character movement and interaction
- Area interaction features
- Real-time communication

#### Terminal

![Terminal](docs/images/远程终端.png)

- SSE protocol remote terminal
- Multi-node support
- Full-screen mode
- Custom shell and working directory

#### Remote Desktop

![Remote Desktop](docs/images/远程桌面.png)

- Linux/Windows remote desktop
- Real-time screen transmission
- Mouse and keyboard operations
- Clipboard synchronization

#### Files

![Files](docs/images/文件浏览器.png)

- Workspace file browsing
- File editing and preview
- File upload and download
- Directory management

#### System

![System](docs/images/系统监视器.png)

- CPU, memory, disk usage
- Network connection status
- Instance online status
- Runtime statistics

#### Settings

![Settings](docs/images/系统设置.png)

- Connection configuration management
- Appearance and theme settings
- Environment variable configuration

***

### II. Hermes Agent Module

#### Hermes Dashboard

- System status overview (version, uptime, active sessions)
- Token usage and cost analytics (daily / by model)
- Gateway platform status

#### Hermes Chat

- Real-time chat via OpenAI-compatible API (SSE streaming)
- 17+ slash commands (`/new`, `/model`, `/skills`, `/commands`, `/help`, etc.)
- Command panel auto-completion (type `/` to trigger, Tab to complete, arrow keys to navigate)
- Tool Calls visualization
- Markdown rendering + code highlighting + LaTeX formulas
- Real-time token usage statistics

#### Hermes Sessions

- Session list (pagination, search)
- Session message history
- Full-text search (FTS5)
- Session deletion

#### Hermes Models

- Model list (OpenAI-compatible format)
- Current model switching
- Model capability tags (vision, function\_calling, etc.)

#### Hermes Channels

- Messaging platform configuration (Telegram, Discord, Slack, etc.)
- Platform status monitoring
- OAuth authentication management

#### Hermes Skills

- Skill list (enable/disable toggle)
- Skill categories and version info
- Skill descriptions and status

#### Hermes Cron

- Scheduled task CRUD
- Task pause/resume/manual trigger
- Cron expression configuration

#### Hermes Memory

- SOUL.md personality configuration editor
- AGENTS.md agent instructions editor
- Markdown editor + template snippets

#### Hermes System

- Configuration management (structured form + raw YAML editor)
- Environment variable management (masked display, reveal plaintext)
- Log viewer (filter by level/component/keyword)
- Toolset list

#### Hermes CLI Terminal 🔥

- **Real CLI Experience**: Spawns Hermes CLI process via node-pty for full terminal emulation
- **Session Persistence**: Browser disconnect does not terminate the CLI process; supports reconnection with output buffer replay
- **Launch Configuration Panel**: Visual configuration of CLI parameters (model, provider, skills, toolsets, yolo, etc.)
- **Multi-Session Management**: Create multiple CLI sessions with reconnect, detach, rename, and destroy
- **Full CLI Commands**: Supports all CLI-only commands (`/skills`, `/tools`, `/cron`, `/config`, `/browser`, etc.)
- **No WebSocket**: Pure SSE + HTTP POST dual-channel, compatible with strict network policies
- **Terminal Features**: Fullscreen mode, right-click paste, selection copy, auto-fit

***

## Tech Stack

### Frontend Framework

| Technology | Version | Description                         |
| ---------- | ------- | ----------------------------------- |
| Vue        | 3.5.x   | Progressive JavaScript Framework    |
| Vue Router | 4.x     | Official Router                     |
| Pinia      | 3.x     | State Management                    |
| TypeScript | 5.x     | Type-safe JavaScript Superset       |
| Vite       | 7.x     | Next-generation Frontend Build Tool |

### UI Components

| Technology        | Version | Description             |
| ----------------- | ------- | ----------------------- |
| Naive UI          | 2.43.x  | Vue 3 Component Library |
| @vicons/ionicons5 | 0.13.x  | Icon Library            |
| @fortawesome      | 7.x     | Font Awesome Icons      |

### Communication & Data

| Technology   | Version | Description                                      |
| ------------ | ------- | ------------------------------------------------ |
| WebSocket    | -       | Real-time Bidirectional Communication (OpenClaw) |
| SSE          | -       | Server-Sent Events (Hermes)                      |
| markdown-it  | 14.x    | Markdown Parser                                  |
| highlight.js | 11.x    | Code Highlighting                                |
| KaTeX        | 16.x    | LaTeX Math Formula Rendering                     |

### Backend Services

| Technology     | Version | Description                            |
| -------------- | ------- | -------------------------------------- |
| Express        | 5.x     | Node.js Web Framework                  |
| ws             | 8.x     | WebSocket Implementation               |
| better-sqlite3 | 12.x    | SQLite Database                        |
| node-pty       | 1.x     | Pseudo Terminal Support (CLI Terminal) |
| ssh2           | 1.x     | SSH Client                             |

### Terminal

| Technology             | Version | Description       |
| ---------------------- | ------- | ----------------- |
| @xterm/xterm           | 6.x     | Terminal Emulator |
| @xterm/addon-fit       | 0.11.x  | Terminal Fit      |
| @xterm/addon-web-links | 0.12.x  | Link Support      |

***

## Quick Start

### Requirements

- Node.js >= 18.0.0
- npm >= 9.0.0
- Python >= 3.10 (required for Hermes CLI terminal only)

### Install Dependencies

```bash
npm install
```

### Initialize Environment Variables

```bash
cp .env.example .env
```

### Development Mode

Start frontend development server:

```bash
npm run dev
```

Start backend server:

```bash
npm run dev:server
```

Start both frontend and backend:

```bash
npm run dev:all
```

Visit `http://localhost:3001` to access the management interface.

### Production Build

```bash
npm run build
```

### Preview Build

```bash
npm run preview
```

***

## Hermes Agent Integration

### Prerequisites

Hermes Agent must be installed and configured separately. OpenClaw Admin communicates with Hermes Agent via HTTP API. The following services need to be running:

| Service           | Default Port | Description                                          |
| ----------------- | ------------ | ---------------------------------------------------- |
| Hermes Web UI     | 9119         | Management REST API (sessions, config, skills, etc.) |
| Hermes API Server | 8642         | OpenAI-compatible API (chat, models, runs)           |
| Hermes CLI        | -            | Python CLI tool (used by Web terminal)               |

### Installing Hermes Agent

```bash
# Clone Hermes Agent
git clone https://github.com/hermes-agent/hermes-agent.git ~/.hermes
cd ~/.hermes

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e .

# Run interactive setup wizard
hermes setup
```

### Configuring Hermes Agent

#### 1. Set Up AI Model Provider

Hermes Agent supports multiple AI providers. Choose one to configure:

**Option A: Via Setup Wizard (Recommended)**

```bash
hermes setup model
```

**Option B: Via Environment Variables**

Edit `~/.hermes/.env` file:

```bash
# OpenRouter (default)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Or use Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Or use OpenAI
OPENAI_API_KEY=sk-xxxxx

# Or use a Custom Provider (e.g., locally deployed models)
CUSTOM_API_KEY=your-api-key
CUSTOM_BASE_URL=http://your-server:port/v1
```

#### 2. Configure Default Model

```bash
# Interactive selection
hermes model

# Or set via config file
# Edit ~/.hermes/config.yaml
# model: anthropic/claude-sonnet-4
```

#### 3. Start Hermes Gateway

```bash
# Foreground (for debugging)
hermes gateway run -v

# Background (for production)
hermes gateway start

# Check status
hermes gateway status
```

#### 4. Verify Connection

```bash
# Check API Server
curl http://localhost:8642/v1/health

# Check Web UI
curl http://localhost:9119/api/status
```

### Connecting Hermes in OpenClaw Admin

1. Log in to OpenClaw Admin
2. Go to the **Settings** page
3. In the **Hermes Agent** section, configure:
   - **Web UI URL**: `http://localhost:9119` (default)
   - **API Server URL**: `http://localhost:8642` (default)
   - **API Key**: Fill in if `API_SERVER_KEY` is configured
4. Click **Test Connection** to verify
5. Save the configuration; the sidebar will display the Hermes module entries

### Environment Variables

Configure Hermes-related parameters in the `.env` file:

```env
# === Hermes Agent Configuration ===
HERMES_WEB_URL=http://localhost:9119    # Hermes Web UI URL
HERMES_API_URL=http://localhost:8642    # Hermes API Server URL
HERMES_API_KEY=                         # Hermes API key (optional)
HERMES_CLI_PATH=/path/to/hermes         # Hermes CLI path (optional, auto-detected by default)
```

### CLI Terminal Usage

The Hermes CLI terminal supports the following launch parameters:

| Parameter           | Type      | Description                                               |
| ------------------- | --------- | --------------------------------------------------------- |
| `-m` / `--model`    | string    | Specify model (e.g., `anthropic/claude-sonnet-4`)         |
| `--provider`        | string    | Specify provider (auto/openrouter/anthropic/custom, etc.) |
| `-s` / `--skills`   | string\[] | Pre-load skills (multiple allowed)                        |
| `-t` / `--toolsets` | string    | Toolsets (comma-separated)                                |
| `-r` / `--resume`   | string    | Resume a specific session                                 |
| `-c` / `--continue` | string    | Continue a named session                                  |
| `--yolo`            | boolean   | Skip dangerous command confirmations                      |
| `--checkpoints`     | boolean   | Enable filesystem checkpoints                             |
| `--max-turns`       | number    | Maximum tool iteration count                              |
| `-v` / `--verbose`  | boolean   | Verbose output                                            |
| `-Q` / `--quiet`    | boolean   | Quiet mode                                                |

In the Web interface, expand the **Launch Config** panel to visually configure these parameters.

***

## Project Structure

```
openclaw-admin/
├── src/
│   ├── api/                        # API Layer
│   │   ├── hermes/                 # Hermes API Client
│   │   │   └── client.ts           # HermesApiClient class
│   │   ├── types/                  # TypeScript Type Definitions
│   │   ├── connect.ts              # Connection Management
│   │   ├── rpc-client.ts           # RPC Client
│   │   └── websocket.ts            # WebSocket Wrapper
│   │
│   ├── assets/                     # Static Assets
│   │   └── styles/
│   │       └── main.css            # Global Styles
│   │
│   ├── components/                 # Components
│   │   ├── common/                 # Common Components
│   │   ├── layout/                 # Layout Components
│   │   └── office/                 # Office Scene Components
│   │
│   ├── composables/                # Composables
│   │   ├── useEventStream.ts       # Event Stream
│   │   ├── useResizable.ts         # Resize Handling
│   │   └── useTheme.ts             # Theme Management
│   │
│   ├── i18n/                       # Internationalization
│   │   ├── messages/
│   │   │   ├── zh-CN.ts            # Chinese
│   │   │   └── en-US.ts            # English
│   │   └── index.ts
│   │
│   ├── layouts/                    # Layouts
│   │   └── DefaultLayout.vue
│   │
│   ├── router/                     # Router
│   │   ├── index.ts
│   │   └── routes.ts
│   │
│   ├── stores/                     # Pinia State Management
│   │   ├── hermes/                 # Hermes State Management
│   │   │   ├── connection.ts       # Connection Management
│   │   │   ├── config.ts           # Configuration
│   │   │   ├── chat.ts             # Chat
│   │   │   ├── session.ts          # Session Management
│   │   │   ├── model.ts            # Model Management
│   │   │   ├── channel.ts          # Channel Management
│   │   │   ├── skill.ts            # Skill Management
│   │   │   ├── cron.ts             # Scheduled Tasks
│   │   │   └── memory.ts           # Memory
│   │   ├── hermes-cli.ts           # Hermes CLI Terminal
│   │   ├── agent.ts                # Agent
│   │   ├── auth.ts                 # Authentication
│   │   ├── channel.ts              # Channel
│   │   ├── chat.ts                 # Chat
│   │   ├── config.ts               # Configuration
│   │   ├── cron.ts                 # Scheduled Tasks
│   │   ├── memory.ts               # Memory
│   │   ├── model.ts                # Model
│   │   ├── session.ts              # Session
│   │   ├── skill.ts                # Skill
│   │   ├── terminal.ts             # Terminal
│   │   ├── theme.ts                # Theme
│   │   └── websocket.ts            # WebSocket
│   │
│   ├── utils/                      # Utilities
│   │   ├── channel-config.ts
│   │   ├── format.ts
│   │   ├── markdown.ts
│   │   └── secret-mask.ts
│   │
│   ├── views/                      # Page Views
│   │   ├── hermes/                 # Hermes Module Pages
│   │   │   ├── HermesDashboard.vue # Dashboard
│   │   │   ├── HermesChatPage.vue  # Chat
│   │   │   ├── HermesSessionsPage.vue  # Sessions
│   │   │   ├── HermesModelsPage.vue    # Models
│   │   │   ├── HermesChannelsPage.vue  # Channels
│   │   │   ├── HermesSkillsPage.vue    # Skills
│   │   │   ├── HermesCronPage.vue      # Cron
│   │   │   ├── HermesMemoryPage.vue    # Memory
│   │   │   ├── HermesSystemPage.vue    # System
│   │   │   └── HermesCliPage.vue       # CLI Terminal
│   │   ├── agents/                 # Multi-Agent
│   │   ├── channels/               # Channel Management
│   │   ├── chat/                   # Online Chat
│   │   ├── cron/                   # Scheduled Tasks
│   │   ├── memory/                 # Memory Management
│   │   ├── models/                 # Model Management
│   │   ├── sessions/               # Session Management
│   │   ├── skills/                 # Skill Management
│   │   ├── system/                 # System Monitoring
│   │   ├── terminal/               # Remote Terminal
│   │   ├── remote-desktop/         # Remote Desktop
│   │   ├── files/                  # File Browser
│   │   ├── office/                 # Agent Workshop
│   │   ├── myworld/                # Virtual Company
│   │   ├── monitor/                # Operations Center
│   │   ├── settings/               # System Settings
│   │   ├── Dashboard.vue           # Dashboard
│   │   └── Login.vue               # Login Page
│   │
│   ├── App.vue                     # Root Component
│   ├── main.ts                     # Entry File
│   └── env.d.ts                    # Environment Type Declarations
│
├── server/                         # Backend Services
│   ├── index.js                    # Server Entry (includes Hermes CLI proxy)
│   ├── hermes-proxy.js             # Hermes API Proxy
│   ├── gateway.js                  # Gateway Connection
│   └── database.js                 # Database Operations
│
├── public/                         # Public Static Assets
├── dist/                           # Build Output
├── data/                           # Data Storage
│
├── vite.config.ts                  # Vite Configuration
├── tsconfig.json                   # TypeScript Configuration
├── package.json                    # Project Configuration
├── .env.example                    # Environment Variables Example
└── .env                            # Local Environment Variables (copied from .env.example)
```

***

## Development Guide

### Code Style

- Use Vue 3 Composition API + `<script setup lang="ts">`
- Follow 2-space indentation, single quotes, trailing commas, no semicolons
- Use `@/` alias for `src` path imports

### Naming Conventions

| Type        | Convention     | Example                |
| ----------- | -------------- | ---------------------- |
| Components  | PascalCase.vue | `ConnectionStatus.vue` |
| Route Pages | \*Page.vue     | `HermesChatPage.vue`   |
| Store       | camelCase.ts   | `hermes-cli.ts`        |
| Composable  | use\*.ts       | `useTheme.ts`          |

### Build Verification

Before submitting, ensure:

```bash
npm run build
```

Build passes with no type errors.

### Environment Variables

First copy the example file, then fill in according to your local environment:

```bash
cp .env.example .env
```

Then configure in `.env` file:

```env
# === Application ===
VITE_APP_TITLE=OpenClaw Admin
PORT=3000
DEV_PORT=3001

# === Authentication ===
AUTH_USERNAME=admin
AUTH_PASSWORD=admin

# === OpenClaw Gateway ===
OPENCLAW_WS_URL=ws://localhost:18789
OPENCLAW_AUTH_TOKEN=
OPENCLAW_AUTH_PASSWORD=        # Gateway password, either one with Token is enough

# === Hermes Agent ===
HERMES_WEB_URL=http://localhost:9119
HERMES_API_URL=http://localhost:8642
HERMES_API_KEY=
HERMES_CLI_PATH=               # Hermes CLI path (optional, auto-detected by default)

# === Other ===
LOG_LEVEL=INFO
MEDIA_DIR=
```

***

## API Reference

### OpenClaw WebSocket RPC Methods

The project communicates with OpenClaw Gateway via WebSocket, supporting the following RPC methods:

#### Configuration Management

- `config.get` - Get configuration
- `config.patch` - Update configuration
- `config.set` - Set configuration
- `config.apply` - Apply configuration

#### Session Management

- `sessions.list` - List sessions
- `sessions.get` - Get session details
- `sessions.reset` - Reset session
- `sessions.delete` - Delete session
- `sessions.spawn` - Create session
- `sessions.history` - Get history
- `sessions.usage` - Get usage statistics

#### Channel Management

- `channels.status` - Get channel status
- `channel.auth` - Channel authentication
- `channel.pair` - Channel pairing

#### Agent Management

- `agents.list` - List agents
- `agents.create` - Create agent
- `agents.update` - Update agent
- `agents.delete` - Delete agent
- `agents.files.list` - List files
- `agents.files.get` - Get file
- `agents.files.set` - Set file

#### Model Management

- `models.list` - List models

#### Scheduled Tasks

- `cron.list` - List tasks
- `cron.add` - Add task
- `cron.update` - Update task
- `cron.delete` - Delete task
- `cron.run` - Execute task

#### System Monitoring

- `health` - Health check
- `status` - Status query
- `system-presence` - Instance status
- `logs.tail` - View logs

### Hermes REST API Proxy

The backend proxies requests to two Hermes Agent services via `hermes-proxy.js`:

| Target Service    | Default Port | Proxy Prefix      | Description                                     |
| ----------------- | ------------ | ----------------- | ----------------------------------------------- |
| Hermes Web UI     | 9119         | `/api/hermes/`    | Management API (sessions, config, skills, etc.) |
| Hermes API Server | 8642         | `/api/hermes/v1/` | OpenAI-compatible API (chat, models, runs)      |

### Hermes CLI Terminal API

| Method | Path                              | Description                               |
| ------ | --------------------------------- | ----------------------------------------- |
| GET    | `/api/hermes-cli/stream`          | Create/reconnect CLI session (SSE stream) |
| POST   | `/api/hermes-cli/input`           | Send keyboard input to CLI process        |
| POST   | `/api/hermes-cli/resize`          | Resize terminal                           |
| POST   | `/api/hermes-cli/destroy`         | Destroy CLI session                       |
| POST   | `/api/hermes-cli/heartbeat`       | Heartbeat keep-alive                      |
| GET    | `/api/hermes-cli/sessions`        | List all CLI sessions                     |
| POST   | `/api/hermes-cli/sessions/rename` | Rename a session                          |

***

## Security Notes

- ⚠️ **Never commit** real Gateway tokens, API keys, or other sensitive information
- Credential fields use masked display, plain text is never echoed
- API Keys are only submitted when a new value is entered, otherwise the original value is kept
- Hermes CLI sessions have a 2-hour orphan timeout for automatic cleanup

***

## License

[MIT License](LICENSE)

***

## Contributing

Issues and Pull Requests are welcome!

**GitHub Repository**: <https://github.com/itq5/OpenClaw-Admin>

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

***

## Contact

### Author Email

📧 <root@itq5.com>

### WeChat Group

Welcome to join our WeChat group for latest updates and technical support:

![WeChat Group](docs/images/微信群.png)
![WeChat Group-2](docs/images/微信群-2.png)
![WeChat Group-3](docs/images/微信群-3.png)
![WeChat Group-4](docs/images/微信群-4.png)

***

<p align="center">
  Made with ❤️ by <a href="https://github.com/itq5/OpenClaw-Admin">Claw Admin</a> Team
</p>
