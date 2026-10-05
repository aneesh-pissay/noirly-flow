import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import mongoose from "mongoose";
import {
  E2E_BASE_URL,
  E2E_MONGODB_URI,
  SESSION_COOKIE,
  USERS,
  storageStatePath,
  type E2EUser,
} from "./env";
import { sessionStorageState } from "./session";

/**
 * 1. Empty the e2e database, so every run starts from first login.
 * 2. Mint a session per test user (see session.ts) and save it as Playwright
 *    storage state. Flow provisions the user and their Personal workspace on
 *    first request.
 */
export default async function globalSetup() {
  if (!/noirly-flow-e2e/.test(E2E_MONGODB_URI)) {
    throw new Error(`Refusing to wipe a non-e2e database: ${E2E_MONGODB_URI}`);
  }
  // Empty every collection rather than dropping the database: a reused server
  // created its unique indexes at startup and would not recreate them.
  const connection = await mongoose.createConnection(E2E_MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  }).asPromise();
  for (const collection of await connection.db!.collections()) {
    await collection.deleteMany({});
  }
  await connection.close();

  for (const key of Object.keys(USERS) as E2EUser[]) {
    const state = await sessionStorageState(key);
    const path = storageStatePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state));

    // Provision each account once before tests run in parallel, so every
    // test starts from a signed-in user with a Personal workspace.
    const response = await fetch(`${E2E_BASE_URL}/api/workspaces`, {
      headers: { cookie: `${SESSION_COOKIE}=${state.cookies[0]!.value}` },
    });
    if (!response.ok) {
      throw new Error(`Provisioning ${key} failed: ${response.status} ${await response.text()}`);
    }
  }
}
