/**
 * Builds and serves Flow exactly as the e2e and docs-capture runs do (port
 * 3102, `.next-e2e`, the isolated e2e database), and keeps it running so
 * several capture runs can share one build.
 *
 *   npx tsx docs-pipeline/serve.ts            build, then serve
 *   npx tsx docs-pipeline/serve.ts --no-build serve the last build
 */
import { spawn } from "node:child_process";
import { E2E_ENV, E2E_PORT } from "../e2e/env";

const env = { ...process.env, ...E2E_ENV };
const shell = process.platform === "win32";

function run(args: string[]) {
  return new Promise<number>((resolve) => {
    spawn("pnpm", args, { stdio: "inherit", shell, env }).on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (!process.argv.includes("--no-build")) {
    const built = await run(["build"]);
    if (built !== 0) process.exit(built);
  }
  process.exit(await run(["start", "--port", String(E2E_PORT)]));
}

void main();
