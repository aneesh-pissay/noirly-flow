/**
 * Turns captures into published media:
 *   1. screenshots → public/docs/screenshots/<id>/
 *   2. raw.webm → recording.mp4, then Remotion renders the tutorial
 *   3. poster and captions (.vtt) → public/docs/videos/; the MP4 stays in
 *      docs-pipeline/video/out/ for uploading to R2 (src/docs/video-host.ts)
 *   4. src/docs/media.json updated for exactly the articles processed
 *
 *   npx tsx docs-pipeline/render.ts                 every capture on disk
 *   npx tsx docs-pipeline/render.ts quick-add tags  just these
 *
 * A capture whose scenario failed is never published: its old media stays,
 * and the report says so.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getArticle, CATEGORIES } from "@/src/docs/registry";
import type { ArticleMedia, DocArticle, MediaManifest } from "@/src/docs/types";
import type { CaptureResult } from "./capture/recorder";
import { VIEWPORT } from "./capture/recorder";
import { cues, scenes } from "./video/src/timeline";
import type { TutorialProps } from "./video/src/types";

const ROOT = process.cwd();
const CAPTURES = path.join(ROOT, "docs-pipeline/.captures");
const VIDEO_PKG = path.join(ROOT, "docs-pipeline/video");
const MEDIA_FILE = path.join(ROOT, "src/docs/media.json");
const shell = process.platform === "win32";

/** "How it works" flowcharts for features whose logic is easier to see than to read. */
const FLOWS: Record<string, string[]> = {
  "signing-in": ["Choose Noirly Login", "Sign in with Noirly Identity", "Your Personal workspace is ready"],
  automations: ["A task is created or changed", "The rule's conditions are checked", "Its actions run", "The run is logged"],
  webhooks: ["A task or comment changes", "Flow signs the event", "POST to your endpoint", "Retried if it fails"],
  "intake-forms": ["Someone fills in the public form", "Answers are checked", "A task is created with your defaults", "Automations and webhooks run"],
  recurrence: ["You complete the task", "The rule picks the next date", "A new copy appears"],
  approvals: ["Request approval", "The approver is notified", "Approve or request changes", "The task can be finished"],
  dependencies: ["Link what it waits on", "The task shows Blocked", "The blocker is done", "The task can be finished"],
  reminders: ["Set a due time", "Choose a lead time", "Bell and email when it's due"],
  "calendar-sync": ["Connect your calendar", "Flow creates its own calendar", "Edits sync both ways"],
  import: ["Choose a CSV", "Preview and map columns", "Tasks, sections and tags created"],
  "saved-filters": ["Write a query", "Checked as you type", "Saved to your sidebar"],
  templates: ["Save a task or project", "Shared with the workspace", "Start new work from it"],
};

function ffmpeg(args: string[]) {
  execFileSync("npx", ["remotion", "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: VIDEO_PKG, shell, stdio: "inherit" });
}

function probeDuration(file: string): number {
  const output = execFileSync("npx", ["remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { cwd: VIDEO_PKG, shell }).toString().trim();
  return Number.parseFloat(output);
}

/** Width and height from a JPEG's SOF marker. */
function jpegSize(file: string): { width: number; height: number } {
  const data = readFileSync(file);
  let i = 2;
  while (i < data.length) {
    const marker = data[i + 1]!;
    const length = data.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  return { width: 1920, height: 1080 };
}

function vttTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

function outcomeFor(article: DocArticle) {
  return article.highlights?.[0] ?? article.summary;
}

function propsFor(article: DocArticle, capture: CaptureResult, fileDuration: number): TutorialProps {
  // Skip the blank page load before the first thing happens; keep a beat of lead-in.
  const first = Math.min(capture.steps[0]?.t ?? 0, capture.pointer[0]?.t ?? Infinity);
  const start = Math.max(0, Number((first - 0.8).toFixed(2)));
  const shift = <T extends { t: number }>(items: T[]) => items.map((item) => ({ ...item, t: Number(Math.max(0, item.t - start).toFixed(2)) }));
  const category = CATEGORIES.find((c) => c.id === article.category)!.title;
  return {
    id: article.id,
    title: article.title,
    category,
    summary: article.summary,
    useCases: (article.useCases ?? []).slice(0, 3),
    flow: FLOWS[article.id] ?? null,
    recording: `${article.id}/recording.mp4`,
    recordingStart: start,
    recordingDuration: Number((fileDuration - start).toFixed(2)),
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    steps: shift(capture.steps),
    pointer: shift(capture.pointer),
    offCamera: capture.offCamera,
    troubleshooting: (article.troubleshooting ?? []).slice(0, 2),
    outcome: outcomeFor(article),
  };
}

type Outcome = { id: string; status: "published" | "screenshots-only" | "failed" | "skipped"; detail?: string };

function main() {
  const requested = process.argv.slice(2);
  const ids = (requested.length ? requested : existsSync(CAPTURES) ? readdirSync(CAPTURES) : [])
    .filter((id) => existsSync(path.join(CAPTURES, id, "capture.json")));
  const media: MediaManifest = JSON.parse(readFileSync(MEDIA_FILE, "utf8"));
  const outcomes: Outcome[] = [];
  const toRender: string[] = [];
  const pending = new Map<string, { capture: CaptureResult; props: TutorialProps; screenshots: ArticleMedia["screenshots"] }>();

  for (const id of requested) if (!ids.includes(id)) outcomes.push({ id, status: "skipped", detail: "no capture on disk — run docs:capture first" });

  for (const id of ids) {
    const article = getArticle(id);
    if (!article) { outcomes.push({ id, status: "skipped", detail: "not an article any more" }); continue; }
    const dir = path.join(CAPTURES, id);
    const capture: CaptureResult = JSON.parse(readFileSync(path.join(dir, "capture.json"), "utf8"));
    if (!capture.verified) {
      outcomes.push({ id, status: "failed", detail: `scenario failed, nothing published: ${capture.error ?? "unknown error"}` });
      continue;
    }

    // 1. Screenshots.
    const publicShots = path.join(ROOT, "public/docs/screenshots", id);
    rmSync(publicShots, { recursive: true, force: true });
    mkdirSync(publicShots, { recursive: true });
    const screenshots: ArticleMedia["screenshots"] = {};
    for (const shot of capture.shots) {
      const from = path.join(dir, "shots", shot.file);
      if (!existsSync(from)) continue;
      copyFileSync(from, path.join(publicShots, shot.file));
      screenshots[shot.key] = { src: `/docs/screenshots/${id}/${shot.file}`, alt: shot.alt, ...jpegSize(from) };
    }

    // 2. A clean MP4 of the raw recording (Playwright's WebM has no reliable duration).
    const raw = path.join(dir, "raw.webm");
    if (!existsSync(raw)) {
      media[id] = { screenshots, fingerprint: capture.fingerprint, capturedAt: capture.capturedAt, verified: true, ...(media[id]?.video ? { video: media[id]!.video } : {}) };
      outcomes.push({ id, status: "screenshots-only", detail: "no recording on disk" });
      continue;
    }
    const recording = path.join(dir, "recording.mp4");
    ffmpeg(["-i", raw, "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "30", "-an", recording]);
    const duration = Math.min(probeDuration(recording), capture.duration + 1.5);
    const props = propsFor(article, capture, duration);
    writeFileSync(path.join(dir, "props.json"), JSON.stringify(props, null, 2));
    pending.set(id, { capture, props, screenshots });
    toRender.push(id);
  }

  // 3. Render everything in one Remotion bundle. Old output goes first, so a failed render can't publish a stale file.
  for (const id of toRender) rmSync(path.join(VIDEO_PKG, "out", `${id}.mp4`), { force: true });
  if (toRender.length) {
    const run = spawnSync("node", ["render.mjs", ...toRender], { cwd: VIDEO_PKG, stdio: "inherit", shell });
    if (run.status !== 0) console.warn("Some renders failed; see above.");
  }

  const videos = path.join(ROOT, "public/docs/videos");
  mkdirSync(videos, { recursive: true });
  for (const id of toRender) {
    const { capture, props, screenshots } = pending.get(id)!;
    const rendered = path.join(VIDEO_PKG, "out", `${id}.mp4`);
    if (!existsSync(rendered)) {
      media[id] = { screenshots, fingerprint: capture.fingerprint, capturedAt: capture.capturedAt, verified: true, ...(media[id]?.video ? { video: media[id]!.video } : {}) };
      outcomes.push({ id, status: "screenshots-only", detail: "render failed; previous video (if any) kept" });
      continue;
    }
    const all = scenes(props);
    const walkthrough = all.find((scene) => scene.key === "walkthrough")!;
    ffmpeg(["-ss", String(walkthrough.start + Math.min(4, props.recordingDuration / 2)), "-i", rendered, "-frames:v", "1", "-q:v", "4", path.join(videos, `${id}.jpg`)]);
    const transcript = cues(props);
    writeFileSync(path.join(videos, `${id}.vtt`), `WEBVTT\n\n${transcript.map((cue, i) => `${i + 1}\n${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cue.text}\n`).join("\n")}`);
    media[id] = {
      video: {
        src: `/docs/videos/${id}.mp4`,
        poster: `/docs/videos/${id}.jpg`,
        captions: `/docs/videos/${id}.vtt`,
        duration: Number(probeDuration(rendered).toFixed(2)),
        chapters: all.map((scene) => ({ title: scene.title, start: Number(scene.start.toFixed(2)) })),
        transcript: transcript.map((cue) => ({ start: Number(cue.start.toFixed(2)), end: Number(cue.end.toFixed(2)), text: cue.text })),
      },
      screenshots,
      fingerprint: capture.fingerprint,
      capturedAt: capture.capturedAt,
      verified: true,
    };
    outcomes.push({ id, status: "published" });
  }

  // Stable key order keeps diffs readable.
  const sorted = Object.fromEntries(Object.entries(media).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MEDIA_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  writeFileSync(path.join(CAPTURES, "render-report.json"), JSON.stringify({ at: new Date().toISOString(), outcomes }, null, 2));
  for (const outcome of outcomes) console.log(`${outcome.status.padEnd(17)} ${outcome.id}${outcome.detail ? ` — ${outcome.detail}` : ""}`);
}

main();
