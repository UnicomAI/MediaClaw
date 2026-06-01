#!/usr/bin/env python3
"""将多个视频按顺序合并。

支持两种合并方式：
- demuxer: 快速无损，要求输入格式一致
- filter: 灵活可重编码，可处理不同格式

Usage:
    python helpers/concat_videos.py output.mp4 clip1.mp4 clip2.mp4 clip3.mp4
    python helpers/concat_videos.py output.mp4 --from-list clips.txt
    python helpers/concat_videos.py output.mp4 clip1.mp4 clip2.mp4 --method filter
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


# ============================================================================
# 工具函数
# ============================================================================

def get_video_info(video_path: str) -> dict:
    """获取视频信息"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,codec_name,pix_fmt,r_frame_rate",
             "-show_entries", "format=duration",
             "-of", "json", video_path],
            capture_output=True, text=True
        )
        info = json.loads(result.stdout)
        result = {}
        if info.get("streams"):
            result.update(info["streams"][0])
        if info.get("format"):
            result["duration"] = info["format"].get("duration")
        return result
    except Exception:
        return {}


def check_format_compatibility(video_paths: list[str]) -> bool:
    """检查视频格式是否兼容（用于 demuxer 模式）"""
    if len(video_paths) < 2:
        return True
    
    # 获取第一个视频的参数
    first_info = get_video_info(video_paths[0])
    first_codec = first_info.get("codec_name")
    first_pix_fmt = first_info.get("pix_fmt")
    
    for path in video_paths[1:]:
        info = get_video_info(path)
        if info.get("codec_name") != first_codec:
            print(f"警告：编码格式不一致: {video_paths[0]} ({first_codec}) vs {path} ({info.get('codec_name')})")
            return False
        if info.get("pix_fmt") != first_pix_fmt:
            print(f"警告：像素格式不一致: {video_paths[0]} ({first_pix_fmt}) vs {path} ({info.get('pix_fmt')})")
            return False
    
    return True


def concat_demuxer(input_paths: list[str], output_path: str) -> None:
    """使用 concat demuxer 合并（快速无损）
    
    要求所有输入视频具有相同的编码格式。
    """
    # 创建临时文件列表
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        for p in input_paths:
            # 转义路径中的特殊字符
            escaped = str(Path(p).resolve()).replace("\\", "/").replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")
        list_file = f.name
    
    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", list_file,
            "-c", "copy",
            "-movflags", "+faststart",
            output_path,
        ]
        print(f"合并 {len(input_paths)} 个视频（demuxer 模式）...")
        subprocess.run(cmd, check=True)
    finally:
        Path(list_file).unlink()


def concat_filter(input_paths: list[str], output_path: str, preset: str = "fast", crf: int = 20) -> None:
    """使用 concat filter 合并（灵活，可处理不同格式）
    
    可以合并不同编码格式的视频，但需要重新编码。
    """
    # 获取所有输入的视频流和音频流
    has_audio = []
    for p in input_paths:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", p],
            capture_output=True, text=True
        )
        has_audio.append(bool(result.stdout.strip()))
    
    all_have_audio = all(has_audio)
    
    # 构建输入和滤镜
    inputs = []
    filter_parts = []
    
    for i, p in enumerate(input_paths):
        inputs.extend(["-i", p])
        filter_parts.append(f"[{i}:v]")
        if all_have_audio:
            filter_parts.append(f"[{i}:a]")
    
    # concat 滤镜
    n = len(input_paths)
    if all_have_audio:
        filter_complex = "".join(filter_parts) + f"concat=n={n}:v=1:a=1[outv][outa]"
        output_maps = ["-map", "[outv]", "-map", "[outa]"]
        audio_args = ["-c:a", "aac", "-b:a", "192k"]
    else:
        filter_complex = "".join([f"[{i}:v]" for i in range(n)]) + f"concat=n={n}:v=1:a=0[outv]"
        output_maps = ["-map", "[outv]"]
        audio_args = ["-an"]  # 无音频
    
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        *output_maps,
        "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        *audio_args,
        "-movflags", "+faststart",
        output_path,
    ]
    
    print(f"合并 {len(input_paths)} 个视频（filter 模式）...")
    subprocess.run(cmd, check=True)


def concat_videos(
    input_paths: list[str],
    output_path: str,
    method: str = "demuxer",
    preset: str = "fast",
    crf: int = 20,
    force_filter: bool = False,
) -> None:
    """合并视频
    
    Args:
        input_paths: 输入视频路径列表
        output_path: 输出视频路径
        method: 合并方法（demuxer/filter/auto）
        preset: 编码预设（仅 filter 模式）
        crf: CRF 值（仅 filter 模式）
        force_filter: 强制使用 filter 模式
    """
    if not input_paths:
        sys.exit("错误：未提供输入文件")
    
    # 检查输入文件
    for p in input_paths:
        if not Path(p).exists():
            sys.exit(f"错误：输入文件不存在: {p}")
    
    # 确保输出目录存在
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    # 选择合并方法
    if method == "filter" or force_filter:
        concat_filter(input_paths, output_path, preset, crf)
    elif method == "demuxer":
        # 检查格式兼容性
        if check_format_compatibility(input_paths):
            concat_demuxer(input_paths, output_path)
        else:
            print("格式不兼容，自动切换到 filter 模式")
            concat_filter(input_paths, output_path, preset, crf)
    else:  # auto
        if check_format_compatibility(input_paths):
            concat_demuxer(input_paths, output_path)
        else:
            concat_filter(input_paths, output_path, preset, crf)
    
    print(f"完成: {output_path}")


# 需要导入 json
import json


def main() -> None:
    ap = argparse.ArgumentParser(
        description="将多个视频按顺序合并",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  # 快速无损合并（要求格式一致）
  python concat_videos.py output.mp4 clip1.mp4 clip2.mp4 clip3.mp4

  # 从列表文件合并
  python concat_videos.py output.mp4 --from-list clips.txt

  # 灵活合并（可处理不同格式）
  python concat_videos.py output.mp4 clip1.mp4 clip2.mp4 --method filter

  # 自动选择合并方式
  python concat_videos.py output.mp4 clip1.mp4 clip2.mp4 --method auto
"""
    )
    
    ap.add_argument("output", help="输出视频路径")
    ap.add_argument("inputs", nargs="*", help="输入视频路径")
    ap.add_argument("--from-list", help="从文件读取输入列表（每行一个路径）")
    ap.add_argument("--method", choices=["demuxer", "filter", "auto"], default="auto",
                    help="合并方式：demuxer（快速无损）/ filter（灵活重编码）/ auto（自动选择）")
    ap.add_argument("--preset", default="fast", help="编码预设（仅 filter 模式）")
    ap.add_argument("--crf", type=int, default=20, help="CRF 值（仅 filter 模式）")
    ap.add_argument("--force-filter", action="store_true", help="强制使用 filter 模式")
    ap.add_argument("--info", action="store_true", help="仅显示输入文件信息，不合并")
    
    args = ap.parse_args()
    
    # 获取输入文件列表
    if args.from_list:
        with open(args.from_list) as f:
            input_paths = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    else:
        input_paths = args.inputs
    
    if not input_paths:
        sys.exit("错误：未提供输入文件。使用位置参数或 --from-list")
    
    # 仅显示信息
    if args.info:
        print(f"输入文件 ({len(input_paths)} 个):")
        total_duration = 0
        for i, p in enumerate(input_paths):
            info = get_video_info(p)
            duration = float(info.get("duration", 0))
            total_duration += duration
            print(f"  {i+1}. {p}")
            print(f"     分辨率: {info.get('width', '?')}x{info.get('height', '?')}")
            print(f"     编码: {info.get('codec_name', '?')}, 像素格式: {info.get('pix_fmt', '?')}")
            print(f"     时长: {duration:.2f}s")
        print(f"\n总时长: {total_duration:.2f}s ({total_duration/60:.1f}min)")
        return
    
    # 合并视频
    concat_videos(
        input_paths,
        args.output,
        method=args.method,
        preset=args.preset,
        crf=args.crf,
        force_filter=args.force_filter,
    )


if __name__ == "__main__":
    main()
