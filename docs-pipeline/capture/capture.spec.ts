import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import { ARTICLES } from "@/src/docs/registry";
import { sessionStorageState } from "../../e2e/session";
import { fingerprint } from "../lib/fingerprint";
import { Api } from "./api";
import { Recorder, SCALE, VIEWPORT, writeCapture } from "./recorder";
import { SCENARIOS } from "./scenarios";

/** Raw recordings, captions and screenshots; `docs:render` turns them into the published media. */
export const CAPTURE_DIR = path.resolve("docs-pipeline/.captures");

const only = (process.env.DOCS_ONLY ?? "").split(",").map((id) => id.trim()).filter(Boolean);
const wanted = ARTICLES.filter((article) => "scenario" in article.video && (!only.length || only.includes(article.id)));

for (const id of only) {
  if (!ARTICLES.some((article) => article.id === id)) throw new Error(`DOCS_ONLY names an unknown article: ${id}`);
}

for (const article of wanted) {
  const scenario = SCENARIOS[article.id];

  test(article.id, async ({ browser }) => {
    test.skip(!scenario, `No capture scenario for ${article.id}`);
    test.setTimeout(240_000);
    const dir = path.join(CAPTURE_DIR, article.id);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const context = await browser.newContext({
      storageState: await sessionStorageState(scenario!.user ?? "owner"),
      extraHTTPHeaders: { "X-Noirly-CSRF": "1" },
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      colorScheme: "dark",
      reducedMotion: "no-preference",
      acceptDownloads: true,
      // Playwright pads (rather than scales) a page smaller than the video size, so record at the
      // page's own size; Remotion scales it into the 1080p frame. Screenshots use the full 1.5× scale.
      recordVideo: { dir: path.join(dir, "video"), size: VIEWPORT },
    });
    const api = new Api(context.request, browser);
    let error: unknown;
    let rec: Recorder | undefined;
    try {
      const data = await scenario!.setup?.(api);
      const page = await context.newPage();
      rec = new Recorder(page, path.join(dir, "shots"));
      await scenario!.run({ page, rec, api, data, context, browser });
      await rec.pause(1200);
    } catch (caught) {
      error = caught;
    } finally {
      // Closing the page finishes the video; the context stays open so cleanup can use its session.
      const page = context.pages()[0];
      const video = page?.video();
      await page?.close();
      await api.cleanup();
      await context.close();
      if (video) await rename(await video.path(), path.join(dir, "raw.webm"));
      await rm(path.join(dir, "video"), { recursive: true, force: true });
      if (rec) {
        await writeCapture(dir, rec.result(article.id, {
          verified: !error,
          error: error ? String((error as Error).message ?? error).slice(0, 2000) : undefined,
          fingerprint: fingerprint(article.sources),
        }));
      }
    }
    if (error) throw error;
  });
}
