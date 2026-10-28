/**
 * Regenerates only what the scan says is out of date.
 *
 *   npx tsx docs-pipeline/regen.ts              plan: what would be re-captured, what needs review
 *   npx tsx docs-pipeline/regen.ts --run        re-capture + re-render the affected articles
 *   npx tsx docs-pipeline/regen.ts --run tags   just these (still only if affected, unless --force)
 *
 * Needs the isolated server (`pnpm docs:serve`) for --run. Articles whose
 * sources changed are listed for a person (or Claude Code) to re-read and
 * edit; this script never rewrites article text and never marks it current.
 * Unaffected media is left exactly as it is.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ARTICLES } from "@/src/docs/registry";
import { scan } from "./scan";

const shell = process.platform === "win32";
const args = process.argv.slice(2);
const run = args.includes("--run");
const force = args.includes("--force");
const named = args.filter((arg) => !arg.startsWith("--"));

function main() {
  const result = scan();
  let targets = result.staleMedia;
  if (named.length) targets = force ? named : targets.filter((id) => named.includes(id));
  const unknown = named.filter((id) => !ARTICLES.some((a) => a.id === id));
  if (unknown.length) throw new Error(`Unknown article(s): ${unknown.join(", ")}`);

  console.log(`Text to review (sources changed since the inventory): ${result.changed.join(", ") || "none"}`);
  console.log(`Possibly undocumented code: ${result.newSurfaces.join(", ") || "none"}`);
  console.log(`Articles with missing sources: ${result.missingSources.join(", ") || "none"}`);
  console.log(`Media to regenerate: ${targets.join(", ") || "none"}`);
  if (!run || !targets.length) {
    if (!run && targets.length) console.log("\nDry run. Add --run to re-capture and re-render these.");
    return;
  }

  const capture = spawnSync("npx", ["playwright", "test", "-c", "playwright.docs.config.ts"], {
    stdio: "inherit",
    shell,
    env: { ...process.env, DOCS_ONLY: targets.join(",") },
  });
  if (capture.status !== 0) console.warn("Some captures failed; they won't be published.");

  const render = spawnSync("npx", ["tsx", "docs-pipeline/render.ts", ...targets], { stdio: "inherit", shell });
  if (render.status !== 0) console.warn("Rendering reported problems.");

  const reportFile = path.join("docs-pipeline/.captures/render-report.json");
  const outcomes: Array<{ id: string; status: string; detail?: string }> = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8")).outcomes : [];
  const lines = [
    `# Docs regeneration — ${new Date().toISOString()}`,
    "",
    "## Regenerated",
    ...outcomes.filter((o) => o.status === "published").map((o) => `- ${o.id}`),
    "",
    "## Could not be verified (nothing published; previous media kept)",
    ...outcomes.filter((o) => o.status !== "published").map((o) => `- ${o.id}: ${o.status}${o.detail ? ` — ${o.detail}` : ""}`),
    "",
    "## Needs a human review of the article text",
    ...(result.changed.length ? result.changed.map((id) => `- ${id}`) : ["- none"]),
    "",
    "After reviewing, run `pnpm docs:scan --write` to record the reviewed baseline.",
  ];
  writeFileSync("docs-pipeline/.captures/regen-report.md", lines.join("\n"));
  console.log(`\n${lines.join("\n")}`);
}

main();
