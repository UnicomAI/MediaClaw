#!/usr/bin/env python3
"""从视频中提取指定片段，支持 HDR 转换、调色、音频淡入淡出。

Usage:
    python helpers/extract_clip.py <input> <output> --start 10.5 --end 25.3
    python helpers/extract_clip.py <input> <output> --start 10.5 --end 25.3 --hdr-to-sdr --grade warm_cinematic
    python helpers/extract_clip.py <input> <output> --start 10.5 --end 25.3 --auto-hdr --resolution 720p --preview
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


# ============================================================================
# 常量定义
# ============================================================================

PRESET_FILTERS = {
    "subtle": "eq=contrast=1.03:saturation=0.98",
    "neutral_punch": "eq=contrast=1.06:brightness=0.0:saturation=1.0,curves=master='0/0 0.25/0.23 0.75/0.77 1/1'",
    "warm_cinematic": "eq=contrast=1.12:brightness=-0.02:saturation=0.88,colorbalance=rs=0.02:gs=0.0:bs=-0.03:rm=0.04:gm=0.01:bm=-0.02:rh=0.08:gh=0.02:bh=-0.05,curves=master='0/0 0.25/0.22 0.75/0.78 1/1'",
    "none": "",
}

HDR_FILTER = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"

RESOLUTION_MAP = {
    "720p": "1280:-2",
    "1080p": "1920:-2",
    "4k": "3840:-2",
    "4K": "3840:-2",
}

# 预设配置
PRESET_CONFIGS = {
    "preview": {"preset": "medium", "crf": 22},
    "draft": {"preset": "ultrafast", "crf": 28},
    "final": {"preset": "fast", "crf": 20},
}


# ============================================================================
# 工具函数
# ============================================================================

def detect_hdr(video_path: str) -> bool:
    """检测视频是否为 HDR (PQ/HLG)"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=color_transfer",
             "-of", "default=noprint_wrappers=1:nokey=1", video_path],
            capture_output=True, text=True
        )
        return result.stdout.strip() in ["smpte2084", "arib-std-b67"]
    except Exception:
        return False


def get_video_info(video_path: str) -> dict:
    """获取视频信息"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,duration,r_frame_rate,codec_name,color_transfer,color_primaries,color_space",
             "-of", "json", video_path],
            capture_output=True, text=True
        )
        info = json.loads(result.stdout)
        if info.get("streams"):
            return info["streams"][0]
        return {}
    except Exception:
        return {}


def resolve_grade_filter(grade: str | None) -> str:
    """解析调色滤镜"""
    if not grade:
        return ""
    if grade in PRESET_FILTERS:
        return PRESET_FILTERS[grade]
    return grade  # 自定义滤镜


def resolve_resolution(resolution: str) -> str:
    """解析分辨率"""
    if resolution in RESOLUTION_MAP:
        return RESOLUTION_MAP[resolution]
    # 自定义分辨率 WxH
    if "x" in resolution.lower():
        return resolution
    return "1920:-2"  # 默认 1080p


def run_ffmpeg(cmd: list[str]) -> None:
    """运行 FFmpeg 命令"""
    print(f"Running: {' '.join(cmd[:10])}...")
    subprocess.run(cmd, check=True)


# ============================================================================
# 主函数
# ============================================================================

def extract_clip(
    input_path: str,
    output_path: str,
    start: float,
    end: float,
    resolution: str = "1080p",
    grade: str | None = None,
    hdr_to_sdr: bool = False,
    audio_fade: float = 0.03,
    preset: str = "fast",
    crf: int = 20,
    frame_rate: int = 24,
) -> None:
    """提取视频片段
    
    Args:
        input_path: 输入视频路径
        output_path: 输出视频路径
        start: 开始时间（秒）
        end: 结束时间（秒）
        resolution: 分辨率（720p/1080p/4K/WxH）
        grade: 调色预设或自定义滤镜
        hdr_to_sdr: 是否转换 HDR 到 SDR
        audio_fade: 音频淡入淡出时长（秒）
        preset: 编码预设
        crf: CRF 值
        frame_rate: 帧率
    """
    duration = end - start
    
    # 确保输出目录存在
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    # 构建视频滤镜
    video_filters = []
    
    if hdr_to_sdr:
        video_filters.append(HDR_FILTER)
    
    grade_filter = resolve_grade_filter(grade)
    if grade_filter:
        video_filters.append(grade_filter)
    
    # 分辨率缩放
    scale_filter = resolve_resolution(resolution)
    video_filters.append(f"scale={scale_filter}")
    
    vf = ",".join(video_filters)
    
    # 音频淡入淡出
    fade_out_start = max(0, duration - audio_fade)
    af = f"afade=t=in:st=0:d={audio_fade:.3f},afade=t=out:st={fade_out_start:.3f}:d={audio_fade:.3f}"
    
    # FFmpeg 命令
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", input_path,
        "-t", str(duration),
        "-vf", vf,
        "-af", af,
        "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-r", str(frame_rate),
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart",
        output_path,
    ]
    
    print(f"Extracting: {input_path}")
    print(f"  Range: {start:.3f}s - {end:.3f}s ({duration:.3f}s)")
    print(f"  Output: {output_path}")
    
    run_ffmpeg(cmd)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="从视频中提取指定片段，支持 HDR 转换、调色、音频淡入淡出",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  # 基础提取
  python extract_clip.py input.mp4 output.mp4 --start 10.5 --end 25.3

  # 带调色
  python extract_clip.py input.mp4 output.mp4 --start 10.5 --end 25.3 --grade warm_cinematic

  # 自动检测并转换 HDR
  python extract_clip.py input.mp4 output.mp4 --start 10.5 --end 25.3 --auto-hdr

  # 预览质量（快速）
  python extract_clip.py input.mp4 output.mp4 --start 10.5 --end 25.3 --preview

  # 草稿质量（极速）
  python extract_clip.py input.mp4 output.mp4 --start 10.5 --end 25.3 --draft
"""
    )
    
    ap.add_argument("input", help="输入视频路径")
    ap.add_argument("output", help="输出视频路径")
    ap.add_argument("--start", type=float, required=True, help="开始时间（秒）")
    ap.add_argument("--end", type=float, required=True, help="结束时间（秒）")
    ap.add_argument("--resolution", default="1080p", help="分辨率：720p/1080p/4K/WxH（默认 1080p）")
    ap.add_argument("--grade", help="调色预设：subtle/neutral_punch/warm_cinematic/none 或自定义滤镜")
    ap.add_argument("--hdr-to-sdr", action="store_true", help="HDR 转 SDR")
    ap.add_argument("--auto-hdr", action="store_true", help="自动检测 HDR 并转换")
    ap.add_argument("--audio-fade", type=float, default=0.03, help="音频淡入淡出时长（秒，默认 0.03）")
    ap.add_argument("--preset", default="fast", help="编码预设：ultrafast/fast/medium/slow")
    ap.add_argument("--crf", type=int, default=20, help="CRF 值（0-51，默认 20）")
    ap.add_argument("--frame-rate", type=int, default=24, help="帧率（默认 24）")
    ap.add_argument("--preview", action="store_true", help="预览质量（720p, medium, crf=22）")
    ap.add_argument("--draft", action="store_true", help="草稿质量（720p, ultrafast, crf=28）")
    ap.add_argument("--info", action="store_true", help="仅显示视频信息，不提取")
    
    args = ap.parse_args()
    
    # 检查输入文件
    if not Path(args.input).exists():
        sys.exit(f"错误：输入文件不存在: {args.input}")
    
    # 仅显示信息
    if args.info:
        info = get_video_info(args.input)
        is_hdr = detect_hdr(args.input)
        print(f"视频信息: {args.input}")
        print(f"  分辨率: {info.get('width', '?')}x{info.get('height', '?')}")
        print(f"  时长: {info.get('duration', '?')}s")
        print(f"  帧率: {info.get('r_frame_rate', '?')}")
        print(f"  编码: {info.get('codec_name', '?')}")
        print(f"  HDR: {'是' if is_hdr else '否'} ({info.get('color_transfer', 'unknown')})")
        return
    
    # 确定参数
    resolution = args.resolution
    preset = args.preset
    crf = args.crf
    
    if args.preview:
        resolution = "720p"
        preset = "medium"
        crf = 22
    elif args.draft:
        resolution = "720p"
        preset = "ultrafast"
        crf = 28
    
    # 自动检测 HDR
    hdr_to_sdr = args.hdr_to_sdr
    if args.auto_hdr and detect_hdr(args.input):
        hdr_to_sdr = True
        print(f"检测到 HDR，将转换为 SDR")
    
    # 提取片段
    extract_clip(
        args.input,
        args.output,
        args.start,
        args.end,
        resolution=resolution,
        grade=args.grade,
        hdr_to_sdr=hdr_to_sdr,
        audio_fade=args.audio_fade,
        preset=preset,
        crf=crf,
        frame_rate=args.frame_rate,
    )
    
    print(f"完成: {args.output}")


if __name__ == "__main__":
    main()
