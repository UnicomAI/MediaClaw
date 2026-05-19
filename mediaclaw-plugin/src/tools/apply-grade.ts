import * as fs from "fs";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import { execa } from "execa";
import { ToolResult } from "../api/types.js";

// Preset definitions matching grade.py
const PRESETS: Record<string, string> = {
  // Subtle baseline — barely perceptible cleanup. No color shift.
  subtle: "eq=contrast=1.03:saturation=0.98",

  // Minimal corrective grade: light contrast + subtle S-curve, no color shifts.
  neutral_punch:
    "eq=contrast=1.06:brightness=0.0:saturation=1.0," +
    "curves=master='0/0 0.25/0.23 0.75/0.77 1/1'",

  // OPT-IN creative preset for retro/cinematic looks ONLY. Not a default.
  // +12% contrast, crushed blacks, -12% sat, warm shadows + cool highs, filmic curve.
  warm_cinematic:
    "eq=contrast=1.12:brightness=-0.02:saturation=0.88," +
    "colorbalance=" +
    "rs=0.02:gs=0.0:bs=-0.03:" +
    "rm=0.04:gm=0.01:bm=-0.02:" +
    "rh=0.08:gh=0.02:bh=-0.05," +
    "curves=master='0/0 0.25/0.22 0.75/0.78 1/1'",

  // Flat — no grade. Useful as a sentinel for "skip grading this source".
  none: "",
};

/**
 * Get ffmpeg filter string for a preset name.
 */
function getPreset(name: string): string {
  if (!(name in PRESETS)) {
    throw new Error(
      `Unknown preset '${name}'. Available: ${Object.keys(PRESETS).sort().join(", ")}`
    );
  }
  return PRESETS[name];
}

/**
 * List available presets.
 */
function listPresets(): string {
  const lines: string[] = [];
  for (const [name, filter] of Object.entries(PRESETS)) {
    lines.push(`${name}:`);
    lines.push(`  ${filter || "(no filter)"}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Apply color grade to video using ffmpeg.
 */
async function applyGrade(
  inputPath: string,
  outputPath: string,
  filterString: string
): Promise<void> {
  outputPath = path.resolve(outputPath);
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (!filterString) {
    // No filter — just copy
    await execa("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-c", "copy",
      outputPath,
    ]);
  } else {
    // Apply filter with encoding
    await execa("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-vf", filterString,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      "-movflags", "+faststart",
      outputPath,
    ]);
  }
}

export function registerApplyGrade(outputDir?: string) {
  return {
    name: "mediaclaw_apply_grade",
    description: `Apply a color grade to a video via ffmpeg filter chain. 

Two modes:
1. Preset mode — pick a named preset (e.g. 'warm_cinematic', 'neutral_punch', 'subtle', 'none').
2. Custom filter mode — provide a raw ffmpeg filter string.

Available presets:
- subtle: Barely perceptible cleanup, no color shift
- neutral_punch: Light contrast + subtle S-curve, no color shifts  
- warm_cinematic: Retro/cinematic look with teal/orange split (OPT-IN only)
- none: No filter, straight copy

本地处理，无需接口配置。`,
    parameters: Type.Object({
      input_path: Type.String({ description: "Input video path." }),
      output_path: Type.Optional(Type.String({ description: "Output video path." })),
      output_dir: Type.Optional(Type.String({ description: "Output directory." })),
      preset: Type.Optional(
        Type.String({
          description: "Grade preset name: 'subtle', 'neutral_punch', 'warm_cinematic', or 'none'.",
          enum: ["subtle", "neutral_punch", "warm_cinematic", "none"],
        })
      ),
      filter: Type.Optional(
        Type.String({
          description: "Raw ffmpeg filter string. Overrides preset if both provided.",
        })
      ),
      list_presets: Type.Optional(
        Type.Boolean({
          description: "If true, list available presets and return without processing.",
        })
      ),
    }),
    async execute(
      _id: string,
      params: {
        input_path: string;
        output_path?: string;
        output_dir?: string;
        preset?: string;
        filter?: string;
        list_presets?: boolean;
      }
    ): Promise<ToolResult> {
      // Handle list_presets mode
      if (params.list_presets) {
        return {
          content: [
            {
              type: "text",
              text: `Available presets:\n\n${listPresets()}`,
            },
          ],
        };
      }

      const inputPath = params.input_path;

      if (!inputPath || !fs.existsSync(inputPath)) {
        throw new Error(`Input video file does not exist: ${inputPath}`);
      }

      // Determine filter string
      let filterString = "";
      if (params.filter) {
        filterString = params.filter;
      } else if (params.preset) {
        filterString = getPreset(params.preset);
      } else {
        // Default to subtle if neither provided
        filterString = PRESETS.subtle;
      }

      // Determine output path
      const outDir = params.output_dir || outputDir;
      let outputPath = params.output_path;
      if (!outputPath) {
        const ext = path.extname(inputPath) || ".mp4";
        const baseName = path.basename(inputPath, ext);
        const fileName = `mediaclaw_graded_${baseName}_${Date.now()}${ext}`;
        if (outDir) {
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          outputPath = path.resolve(outDir, fileName);
        } else {
          outputPath = path.resolve(fileName);
        }
      }

      try {
        await applyGrade(inputPath, outputPath, filterString);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Apply grade failed: ${message}`);
      }

      const presetInfo = params.preset ? ` (preset: ${params.preset})` : "";
      const filterInfo = filterString
        ? `\nFilter: ${filterString.length > 120 ? filterString.slice(0, 120) + "..." : filterString}`
        : "\nFilter: (none — copy)";

      return {
        content: [
          {
            type: "text",
            text: `Color grade applied${presetInfo}.${filterInfo}\nOutput file: ${outputPath}`,
          },
        ],
      };
    },
  };
}