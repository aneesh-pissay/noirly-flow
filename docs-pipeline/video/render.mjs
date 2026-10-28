/**
 * Renders tutorial MP4s with Remotion. Called by docs-pipeline/render.ts,
 * which has already written each article's props.json and recording.mp4
 * under docs-pipeline/.captures/<id>/.
 *
 *   node render.mjs <id> [<id> …]
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
const captures = path.resolve(here, "../.captures");
const out = path.resolve(here, "out");
const ids = process.argv.slice(2);

if (!ids.length) {
  console.error("Usage: node render.mjs <id> [<id> …]");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

console.log("Bundling the composition…");
const serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts"), publicDir: captures });

let failed = 0;
for (const id of ids) {
  const propsFile = path.join(captures, id, "props.json");
  if (!existsSync(propsFile)) {
    console.error(`✗ ${id}: no props.json`);
    failed++;
    continue;
  }
  const inputProps = JSON.parse(readFileSync(propsFile, "utf8"));
  try {
    const composition = await selectComposition({ serveUrl, id: "Tutorial", inputProps });
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      crf: 21,
      pixelFormat: "yuv420p",
      outputLocation: path.join(out, `${id}.mp4`),
      inputProps,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10) * 10;
        if (pct !== last) {
          last = pct;
          process.stdout.write(`  ${id} ${pct}%\r`);
        }
      },
    });
    console.log(`✓ ${id} (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);
  } catch (error) {
    console.error(`✗ ${id}: ${error instanceof Error ? error.message : error}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
