# FFmpeg 安装指南

FFmpeg 是视频处理的核心依赖，用于视频剪辑、格式转换、字幕烧录、音频处理等操作。MediaClaw 的视频编辑功能需要 FFmpeg 和 FFprobe 在系统 PATH 中可用。

---

## 快速检测

运行以下命令检测 FFmpeg 是否已安装：

```bash
ffmpeg -version
ffprobe -version
```

如果显示版本信息，说明已正确安装。

如果提示：

* `command not found`
* `ffmpeg 不是内部或外部命令`

请根据你的操作系统按照下方步骤安装。

---

# macOS 安装

## 方法一：Homebrew（推荐）

### 安装 Homebrew（如未安装）

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 安装 FFmpeg

```bash
brew install ffmpeg
```

### 验证安装

```bash
ffmpeg -version
```

---

## 方法二：静态编译版本

如果不想安装 Homebrew，可以使用预编译静态版本：

1. 访问：

[evermeet.cx FFmpeg Builds](https://evermeet.cx/ffmpeg/?utm_source=chatgpt.com)

2. 下载：

* `ffmpeg`
* `ffprobe`

3. 添加到系统 PATH：

```bash
sudo mv ffmpeg ffprobe /usr/local/bin/
sudo chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe
```

4. 验证：

```bash
ffmpeg -version
```

---

# Linux 安装

## Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y ffmpeg
```

---

## WSL（Windows Subsystem for Linux）

如果你在 WSL 中使用 MediaClaw，请直接按照 Ubuntu/Debian 方式安装：

```bash
sudo apt update
sudo apt install -y ffmpeg
```

注意：

* FFmpeg 安装在 WSL Linux 环境中
* 不会自动复用 Windows 主机上的 `ffmpeg.exe`

---

# Windows 安装

## 方法一：Winget（推荐）

Windows 10/11 通常已内置 winget。

### 安装 FFmpeg

```powershell
winget install ffmpeg
```

### 验证

```powershell
ffmpeg -version
```

通常 winget 会自动配置 PATH。

如果安装后仍提示：

```text
ffmpeg 不是内部或外部命令
```

请重新打开终端。

若仍无法识别，请手动检查 PATH 配置。

---

## 方法二：Chocolatey

### 安装 Chocolatey（如未安装）

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; `
[System.Net.ServicePointManager]::SecurityProtocol = `
[System.Net.ServicePointManager]::SecurityProtocol -bor 3072; `
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### 安装 FFmpeg

```powershell
choco install ffmpeg
```

---

## 方法三：手动安装

如果不想使用包管理器，可以手动下载并配置 FFmpeg。

### 步骤 1：下载 FFmpeg

1. 访问 [gyan.dev FFmpeg Builds](https://www.gyan.dev/ffmpeg/builds/)
2. 下载 **ffmpeg-release-essentials.zip**（推荐）或 **ffmpeg-release-full.zip**（完整版）
3. 解压到一个固定目录，例如 `C:\ffmpeg\`

解压后的目录结构：

```text
C:\ffmpeg\
├── bin\
│   ├── ffmpeg.exe
│   ├── ffprobe.exe
│   └── ffplay.exe
├── doc\
└── presets\
```

### 步骤 2：添加到系统 PATH

#### 方法 A：通过图形界面（推荐）

1. 按 `Win + R`，输入 `sysdm.cpl`，按回车
2. 点击「高级」选项卡
3. 点击「环境变量」按钮
4. 在「系统变量」区域找到 `Path` 变量，双击打开
5. 点击「新建」按钮
6. 输入 FFmpeg 的 bin 目录路径，例如：

   ```text
   C:\ffmpeg\bin
   ```

7. 点击「确定」保存所有窗口

#### 方法 B：通过 PowerShell（管理员）

以管理员身份运行 PowerShell，执行：

```powershell
# 为当前用户添加
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\ffmpeg\bin", "User")

# 或为所有用户添加（需要管理员权限）
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\ffmpeg\bin", "Machine")
```

### 步骤 3：验证安装

关闭所有终端窗口，重新打开 PowerShell 或 CMD，运行：

```powershell
ffmpeg -version
ffprobe -version
```

如果显示版本信息，说明安装成功。

### 常见问题

**Q: 安装后仍提示「ffmpeg 不是内部或外部命令」？**

- 确认 PATH 中添加的是 `bin` 目录的完整路径（如 `C:\ffmpeg\bin`），不是根目录
- 关闭所有终端窗口后重新打开
- 重启电脑使环境变量生效
- 检查路径中是否包含中文或特殊字符

**Q: 如何确认 PATH 是否正确？**

```powershell
# 查看 FFmpeg 是否在 PATH 中
where.exe ffmpeg

# 应输出类似：
# C:\ffmpeg\bin\ffmpeg.exe
```

---

# 验证安装

安装完成后，打开新的终端窗口并运行：

```bash
ffmpeg -version
ffprobe -version
```

如果显示类似输出，说明安装成功：

```text
ffmpeg version 6.x Copyright (c) 2000-2026 the FFmpeg developers
built with Apple clang version ...
configuration: ...
```

---

# 最小功能测试（推荐）

运行以下命令生成一个测试视频：

```bash
ffmpeg -f lavfi -i testsrc=duration=3:size=1280x720:rate=30 test.mp4
```

如果成功生成 `test.mp4`，说明 FFmpeg 工作正常。

---

# 可选：GPU 硬件加速支持

如果需要更快的视频渲染速度，可以检查 GPU 编码支持。

## NVIDIA NVENC

### Linux / macOS

```bash
ffmpeg -encoders | grep nvenc
```

### Windows PowerShell

```powershell
ffmpeg -encoders | findstr nvenc
```

---

## Intel Quick Sync

### Linux / macOS

```bash
ffmpeg -encoders | grep qsv
```

### Windows PowerShell

```powershell
ffmpeg -encoders | findstr qsv
```

---

# 可选：安装 yt-dlp

`yt-dlp` 用于从在线平台下载视频素材，是 MediaClaw 的可选依赖。

---

## macOS

```bash
brew install yt-dlp
```

---

## Linux

### Debian / Ubuntu

```bash
sudo apt install yt-dlp
```

### 推荐：pipx 安装

```bash
pipx install yt-dlp
```

### 或使用 pip

```bash
pip install yt-dlp
```

---

## Windows

### Winget

```powershell
winget install yt-dlp
```

### Chocolatey

```powershell
choco install yt-dlp
```

---

# 常见问题

## Q: 安装后仍提示「命令未找到」？

### 原因

* PATH 未正确配置
* 当前终端未刷新

### 解决方法

#### Linux / macOS

重新打开终端，或执行：

```bash
source ~/.bashrc
```

或：

```bash
source ~/.zshrc
```

#### Windows

* 重新打开 PowerShell / CMD
* 检查 PATH 是否包含 FFmpeg 的 `bin` 目录

---

## Q: FFmpeg 版本过旧怎么办？

某些 Linux 发行版仓库中的 FFmpeg 版本可能较旧。

建议：

* Linux：使用静态编译版本
* macOS：执行

```bash
brew upgrade ffmpeg
```

* Windows：从官网下载最新版本

---

## Q: MediaClaw 需要哪些编码器？

MediaClaw 视频编辑功能建议：

* FFmpeg ≥ 4.0
* 推荐 FFmpeg ≥ 5.0
* 支持 `libx264`
* 支持 `aac`

检查编码器支持：

### Linux / macOS

```bash
ffmpeg -encoders | grep libx264
ffmpeg -encoders | grep aac
```

### Windows PowerShell

```powershell
ffmpeg -encoders | findstr libx264
ffmpeg -encoders | findstr aac
```

---

# 安装完成后

FFmpeg 安装成功后，你可以继续使用 MediaClaw 的视频编辑功能：

* 视频转码与格式转换
* 视频剪辑与拼接
* 字幕烧录
* 音频处理
* 视频渲染与导出

相关项目：

* [FFmpeg 官方网站](https://ffmpeg.org/)
* [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
* [yt-dlp GitHub 项目](https://github.com/yt-dlp/yt-dlp)
* [BtbN FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds)
