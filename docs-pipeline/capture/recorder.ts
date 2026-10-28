import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";

/** CSS pixels of the recorded page (and its video); screenshots are 1.5× this (1920×1080). */
export const VIEWPORT = { width: 1280, height: 720 } as const;
export const SCALE = 1.5;

export type Box = { x: number; y: number; width: number; height: number };
export type CaptionStep = { t: number; caption: string };
export type PointerEvent = { t: number; kind: "click" | "type" | "drag" | "focus"; box: Box; to?: Box };
export type ShotRecord = { key: string; file: string; alt: string };

export type CaptureResult = {
  id: string;
  steps: CaptionStep[];
  pointer: PointerEvent[];
  shots: ShotRecord[];
  /** Seconds from the start of the recording to the end of the scenario. */
  duration: number;
  verified: boolean;
  error?: string;
  /** Things the scenario did off camera, said in the video so nothing is implied that wasn't shown. */
  offCamera: string[];
  capturedAt: string;
  fingerprint: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drives a page at a watchable pace while noting what happened when: caption
 * steps, where each click landed (for the cursor highlight Remotion draws —
 * headless screencasts have no visible pointer) and named screenshots.
 */
export class Recorder {
  readonly steps: CaptionStep[] = [];
  readonly pointer: PointerEvent[] = [];
  readonly shots: ShotRecord[] = [];
  readonly offCamera: string[] = [];
  private readonly t0 = Date.now();

  constructor(readonly page: Page, private readonly shotDir: string) {}

  now() {
    return (Date.now() - this.t0) / 1000;
  }

  /** A caption that stays up until the next one. */
  say(caption: string) {
    this.steps.push({ t: this.now(), caption });
  }

  /** Something done outside the recording (another person's action, a scheduler run). */
  note(text: string) {
    this.offCamera.push(text);
  }

  async pause(ms = 900) {
    await sleep(ms);
  }

  private async box(target: Locator): Promise<Box> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`Not visible: ${target}`);
    return box;
  }

  private async glide(box: Box) {
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
    await sleep(220);
  }

  async click(target: Locator, caption?: string, options: Parameters<Locator["click"]>[0] = {}) {
    if (caption) this.say(caption);
    const box = await this.box(target);
    this.pointer.push({ t: this.now(), kind: "click", box });
    await this.glide(box);
    await target.click(options);
    await this.pause();
  }

  /** Types visibly, a character at a time. */
  async type(target: Locator, text: string, caption?: string) {
    if (caption) this.say(caption);
    const box = await this.box(target);
    this.pointer.push({ t: this.now(), kind: "type", box });
    await this.glide(box);
    await target.click();
    await target.fill("");
    await target.pressSequentially(text, { delay: 32 });
    await this.pause(600);
  }

  /** Fills at once (long text), still highlighting the field. */
  async fill(target: Locator, text: string, caption?: string) {
    if (caption) this.say(caption);
    const box = await this.box(target);
    this.pointer.push({ t: this.now(), kind: "type", box });
    await this.glide(box);
    await target.fill(text);
    await this.pause(600);
  }

  async select(target: Locator, value: string | { label: string }, caption?: string) {
    if (caption) this.say(caption);
    const box = await this.box(target);
    this.pointer.push({ t: this.now(), kind: "click", box });
    await this.glide(box);
    await target.selectOption(value);
    await this.pause();
  }

  async check(target: Locator, caption?: string, on = true) {
    if (caption) this.say(caption);
    const box = await this.box(target);
    this.pointer.push({ t: this.now(), kind: "click", box });
    await this.glide(box);
    await target.setChecked(on);
    await this.pause();
  }

  async press(key: string, caption?: string) {
    if (caption) this.say(caption);
    await this.page.keyboard.press(key);
    await this.pause();
  }

  /** Points at something without clicking it. */
  async point(target: Locator, caption?: string) {
    if (caption) this.say(caption);
    const box = await this.box(target);
    this.pointer.push({ t: this.now(), kind: "focus", box });
    await this.glide(box);
    await this.pause(1100);
  }

  /**
   * Mouse drag from the centre (or a point) of one box to a point, or to the
   * centre of another element — measured after the source is scrolled into
   * view, since that scroll can move the target.
   */
  async drag(from: Locator, target: { x: number; y: number } | Locator, caption?: string, grab?: { x: number; y: number }) {
    if (caption) this.say(caption);
    const box = await this.box(from);
    let to: { x: number; y: number };
    if ("boundingBox" in target) {
      const end = await target.boundingBox();
      if (!end) throw new Error(`Not visible: ${target}`);
      to = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
    } else {
      to = target;
    }
    const start = grab ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    this.pointer.push({ t: this.now(), kind: "drag", box: { x: start.x - 8, y: start.y - 8, width: 16, height: 16 }, to: { x: to.x - 8, y: to.y - 8, width: 16, height: 16 } });
    await this.page.mouse.move(start.x, start.y, { steps: 12 });
    await this.page.mouse.down();
    await this.page.mouse.move(start.x + 12, start.y + 4, { steps: 4 });
    await this.page.mouse.move(to.x, to.y, { steps: 28 });
    await sleep(150);
    await this.page.mouse.up();
    await this.pause();
  }

  /** A JPEG of the viewport (1920×1080) saved under the article's key. */
  async shot(key: string, alt: string, options: { fullPage?: boolean; mask?: Locator[] } = {}) {
    await mkdir(this.shotDir, { recursive: true });
    const file = path.join(this.shotDir, `${key}.jpg`);
    await this.page.screenshot({ path: file, type: "jpeg", quality: 82, fullPage: options.fullPage ?? false, mask: options.mask, animations: "disabled", caret: "hide" });
    this.shots.push({ key, file: `${key}.jpg`, alt });
  }

  result(id: string, extra: { verified: boolean; error?: string; fingerprint: string }): CaptureResult {
    return { id, steps: this.steps, pointer: this.pointer, shots: this.shots, duration: this.now(), offCamera: this.offCamera, capturedAt: new Date().toISOString(), ...extra };
  }
}

export async function writeCapture(dir: string, result: CaptureResult) {
  await writeFile(path.join(dir, "capture.json"), JSON.stringify(result, null, 2));
}
