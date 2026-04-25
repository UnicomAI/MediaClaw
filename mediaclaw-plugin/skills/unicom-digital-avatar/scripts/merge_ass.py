#!/usr/bin/env python3
"""Merge multiple ASS subtitle files with time offset adjustment."""
import re
import argparse
from pathlib import Path

def parse_timestamp(ts):
    """Parse ASS timestamp (H:MM:SS.cc) to centiseconds."""
    match = re.match(r'(\d+):(\d+):(\d+)\.(\d+)', ts)
    if not match:
        return 0
    h, m, s, cs = int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4))
    return h * 360000 + m * 6000 + s * 100 + cs

def format_timestamp(cs):
    """Format centiseconds to ASS timestamp (H:MM:SS.cc)."""
    h = cs // 360000
    cs %= 360000
    m = cs // 6000
    cs %= 6000
    s = cs // 100
    c = cs % 100
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"

def merge_ass_files(files, output):
    """Merge multiple ASS files into one, adjusting timestamps."""
    header_lines = []
    all_events = []
    current_offset = 0
    events_format_line = None

    for i, filepath in enumerate(files):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        lines = content.split('\n')
        in_events = False
        max_end = 0

        for line in lines:
            stripped = line.strip()

            if i == 0:
                # 从第一个文件完整保留头部信息
                if stripped == '[Events]':
                    header_lines.append(line)
                    in_events = True
                elif not in_events:
                    header_lines.append(line)
                elif stripped.startswith('Format:') and in_events:
                    events_format_line = line

            if stripped.startswith('[Events]'):
                in_events = True
            elif stripped.startswith('Dialogue:'):
                # Parse and adjust timestamp
                match = re.match(r'Dialogue:\s*(\d+),(\d+:\d+:\d+\.\d+),(\d+:\d+:\d+\.\d+),(.*)', line)
                if match:
                    layer = match.group(1)
                    start = parse_timestamp(match.group(2)) + current_offset
                    end = parse_timestamp(match.group(3)) + current_offset
                    rest = match.group(4)
                    all_events.append(f"Dialogue: {layer},{format_timestamp(start)},{format_timestamp(end)},{rest}")
                    if end > max_end:
                        max_end = end

        # Update offset for next file
        current_offset = max_end + 50  # Add 0.5s gap between segments

    # Write output
    with open(output, 'w', encoding='utf-8') as f:
        # 写入原始头部
        for line in header_lines:
            f.write(line + '\n')
        # 确保有 Format 行
        if events_format_line:
            f.write(events_format_line + '\n')
        # 写入所有对话事件
        for event in all_events:
            f.write(event + '\n')

    print(f"Merged {len(files)} ASS files into {output}")
    print(f"Total duration: {format_timestamp(current_offset)}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Merge multiple ASS subtitle files with time offset adjustment.')
    parser.add_argument('--files_and_videos', action='append', nargs=2, metavar=('ASS_FILE', 'VIDEO_FILE'),
                        help='Pairs of ASS subtitle file and corresponding video file (can be specified multiple times)')
    parser.add_argument('--output_file', required=True, help='Output merged ASS file path')

    args = parser.parse_args()

    if not args.files_and_videos:
        print("Error: At least one --files_and_videos pair is required")
        exit(1)

    # 只提取 ass 文件（忽略视频文件）
    ass_files = [pair[0] for pair in args.files_and_videos]
    merge_ass_files(ass_files, args.output_file)
