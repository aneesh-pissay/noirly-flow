/**
 * Compares the source code with the documentation and reports what changed.
 * It never edits an article: changed sources mean "review this", not "done".
 *
 *   npx tsx docs-pipeline/scan.ts            report only
 *   npx tsx docs-pipeline/scan.ts --write    also save src/docs/inventory.json,
 *                                            recording the current state as reviewed
 *
 * It finds:
 *   - new: pages, API routes, feature modules and e2e specs no article covers
 *   - removed: articles whose source files are gone
 *   - changed: articles whose sources changed since the inventory was last written
 *   - stale media: screenshots/videos captured from older sources, or missing
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ARTICLES, mediaFor } from "@/src/docs/registry";
import { fingerprint } from "./lib/fingerprint";

const INVENTORY = "src/docs/inventory.json";
const REPORT_DIR = "docs-pipeline/.captures";

type InventoryArticle = {
  id: string;
  title: string;
  category: string;
  kind: string;
  location: string | null;
  video: "recorded" | "missing" | "unavailable";
  unavailableReason?: string;
  verified: boolean;
  sources: string[];
  fingerprint: string;
};
export type Inventory = {
  generatedAt: string;
  articles: InventoryArticle[];
  discovered: Record<"pages" | "apiRoutes" | "featureModules" | "settingsSections" | "e2eSpecs", string[]>;
  uncovered: string[];
};

const posix = (p: string) => p.replace(/\\/g, "/");

function walk(dir: string, match: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, match);
    return match(full) ? [posix(full)] : [];
  });
}

/** Feature surfaces found in the code, independent of any docs. */
export function discover(): Inventory["discovered"] {
  return {
    pages: walk("app", (f) => /page\.tsx$/.test(f)).filter((f) => !f.startsWith("app/(docs)/")).sort(),
    apiRoutes: walk("app/api", (f) => /route\.ts$/.test(f)).sort(),
    featureModules: readdirSync("src/features").filter((name) => name !== "docs" && statSync(path.join("src/features", name)).isDirectory()).map((name) => `src/features/${name}`).sort(),
    settingsSections: walk("src/features/settings", (f) => /Section\.tsx$/.test(f)).sort(),
    e2eSpecs: walk("e2e", (f) => /\.spec\.ts$/.test(f) && !f.endsWith("docs.spec.ts")).sort(),
  };
}

/** Code surfaces with no user-facing feature of their own in the web app, and why. */
export const NOT_DOCUMENTED: Record<string, string> = {
  "app/(marketing)/privacy/page.tsx": "Legal page, not a feature.",
  "app/api/brand-logo/route.ts": "Serves the brand mark image to the shell.",
  "app/api/identity/account-deleted/route.ts": "Notice from Noirly Identity when an account is deleted; no UI.",
  "app/api/reports/route.ts": "Content reports are filed from the NoirlyFlow mobile app; the web app has no UI for them.",
};

/** Whether a discovered path is described by any article's sources. */
function covered(item: string, sources: string[]) {
  const dir = posix(path.dirname(item));
  return sources.some((source) => {
    const s = posix(source).replace(/\/$/, "");
    return item === s || item.startsWith(`${s}/`) || dir === s || s.startsWith(`${item}/`) || (item.startsWith("src/features/") && s.startsWith(`${item}`));
  });
}

/** e2e specs cover a feature by name; map the ones whose names differ from an article's sources. */
function specCovered(spec: string) {
  const name = path.basename(spec, ".spec.ts");
  const aliases: Record<string, string> = {
    app: "command-palette", basics: "trash-and-undo", bulk: "bulk-edit", calendar: "calendar-feed", chat: "project-chat",
    data: "export-and-backups", drawer: "task-drawer", fields: "custom-fields", filters: "saved-filters", focus: "focus-timer",
    forms: "intake-forms", gantt: "gantt-view", layout: "layout-and-themes", pwa: "install-and-offline", time: "time-tracking",
    tokens: "api-tokens", views: "board-view", agenda: "today-and-upcoming", auth: "signing-in", members: "members-and-roles",
    "email-invites": "invites", "projects-organise": "projects", "project-workspace-crud": "workspaces", "data-export": "export-and-backups",
    "calendar-sync": "calendar-sync", "workspace-settings": "workspace-settings", security: "troubleshooting", sections: "sections",
    spaces: "spaces", stats: "stats", tags: "tags", tasks: "creating-tasks", templates: "templates", timeline: "timeline",
    webhooks: "webhooks", workspaces: "workspaces", approvals: "approvals", attachments: "attachments", automations: "automations",
    capacity: "capacity", dependencies: "dependencies", goals: "goals", habits: "habits", import: "import", review: "review",
  };
  const id = aliases[name] ?? name;
  return ARTICLES.some((article) => article.id === id);
}

export function scan() {
  const discovered = discover();
  const allSources = ARTICLES.flatMap((article) => article.sources);
  const uncovered = [
    ...discovered.pages, ...discovered.apiRoutes, ...discovered.featureModules, ...discovered.settingsSections,
  ].filter((item) => !covered(item, allSources) && !(item in NOT_DOCUMENTED))
    .concat(discovered.e2eSpecs.filter((spec) => !specCovered(spec)));

  const previous: Inventory | null = existsSync(INVENTORY) ? JSON.parse(readFileSync(INVENTORY, "utf8")) : null;
  const before = new Map(previous?.articles.map((a) => [a.id, a]) ?? []);

  const articles: InventoryArticle[] = ARTICLES.map((article) => {
    const media = mediaFor(article.id);
    const unavailable = "unavailable" in article.video ? article.video.unavailable : undefined;
    return {
      id: article.id,
      title: article.title,
      category: article.category,
      kind: article.kind,
      location: article.location ?? null,
      video: unavailable ? "unavailable" : media?.video ? "recorded" : "missing",
      ...(unavailable ? { unavailableReason: unavailable } : {}),
      verified: Boolean(media?.verified),
      sources: article.sources,
      fingerprint: fingerprint(article.sources),
    };
  });

  const missingSources = ARTICLES.filter((article) => article.sources.some((source) => !existsSync(source))).map((a) => a.id);
  const changed = articles.filter((a) => before.has(a.id) && before.get(a.id)!.fingerprint !== a.fingerprint).map((a) => a.id);
  const added = articles.filter((a) => previous && !before.has(a.id)).map((a) => a.id);
  const dropped = previous ? previous.articles.filter((a) => !articles.some((b) => b.id === a.id)).map((a) => a.id) : [];
  const newSurfaces = previous ? uncovered.filter((item) => !previous.uncovered.includes(item)) : uncovered;
  const staleMedia = ARTICLES.filter((article) => "scenario" in article.video).filter((article) => {
    const media = mediaFor(article.id);
    return !media?.video || media.fingerprint !== articles.find((a) => a.id === article.id)!.fingerprint;
  }).map((a) => a.id);

  const inventory: Inventory = { generatedAt: new Date().toISOString(), articles, discovered, uncovered };
  return { inventory, previous, changed, added, dropped, missingSources, newSurfaces, uncovered, staleMedia };
}

function list(title: string, items: string[], empty = "none") {
  return `## ${title} (${items.length})\n\n${items.length ? items.map((item) => `- ${item}`).join("\n") : `_${empty}_`}\n`;
}

function main() {
  const result = scan();
  const { inventory } = result;
  const videos = inventory.articles.filter((a) => a.video === "recorded").length;
  const withScenario = inventory.articles.filter((a) => a.video !== "unavailable").length;
  const report = [
    `# Docs scan — ${inventory.generatedAt}`,
    "",
    `${inventory.articles.length} articles (${inventory.articles.filter((a) => a.kind === "feature").length} feature pages). Videos: ${videos} of ${withScenario} recordable; ${inventory.articles.length - withScenario} marked unavailable.`,
    result.previous ? `Compared with the inventory written ${result.previous.generatedAt}.` : "No saved inventory yet: everything is reported as new. Run with --write after reviewing.",
    "",
    list("Articles whose sources changed — review the text", result.changed),
    list("Articles with missing source files — feature removed or moved?", result.missingSources),
    list("Code surfaces no article covers — possibly undocumented features", result.newSurfaces),
    list("Deliberately not documented", Object.entries(NOT_DOCUMENTED).map(([item, why]) => `${item} — ${why}`)),
    list("Media out of date or missing — re-capture with docs:regen", result.staleMedia),
    list("Articles added since the last inventory", result.added),
    list("Articles removed since the last inventory", result.dropped),
  ].join("\n");

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, "scan-report.md"), report);
  console.log(report);
  if (process.argv.includes("--write")) {
    writeFileSync(INVENTORY, `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`\nSaved ${INVENTORY}: the current sources are now the reviewed baseline.`);
  }
}

if (process.argv[1] && /scan\.ts$/.test(process.argv[1])) main();
