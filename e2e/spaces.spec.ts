import mongoose from "mongoose";
import { E2E_MONGODB_URI } from "./env";
import { expect, test } from "./fixtures";

/**
 * Noirly spaces. There's no Identity in e2e, so a link is set straight in the
 * database; what's checked is Flow's side: a linked team's members are
 * managed in the space, and Identity's notices are verified.
 */

async function linkInDb(workspaceId: string, spaceName: string) {
  const connection = await mongoose.createConnection(E2E_MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    await connection.db!.collection("workspaces").updateOne(
      { _id: new mongoose.Types.ObjectId(workspaceId) },
      // Synced just now, so opening the team doesn't try to reach Identity.
      { $set: { spaceId: "a".repeat(24), spaceName, spaceSyncedAt: new Date() } },
    );
  } finally {
    await connection.close();
  }
}

test.describe("spaces", () => {
  test("space notices must be signed by Identity", async ({ request }) => {
    const garbage = await request.post("/api/identity/space-changed", { data: "not-a-token" });
    expect(garbage.status()).toBe(401);
    const unsigned = await request.post("/api/identity/space-changed", {
      data: "eyJhbGciOiJub25lIiwidHlwIjoic2VjZXZlbnQrand0In0.eyJzdWIiOiJ4In0.",
    });
    expect(unsigned.status()).toBe(401);
  });

  test("a linked team manages members in the space", async ({ page, team }) => {
    await linkInDb(team.workspace.id, "Goa Trip");

    await page.goto(`/w/${team.workspace.id}/members`);
    await expect(page.getByText('Members come from the space "Goa Trip"')).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate link" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send invite" })).toHaveCount(0);

    const invite = await page.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role: "member" } });
    expect(invite.status()).toBe(409);

    await page.goto(`/w/${team.workspace.id}/settings`);
    await expect(page.getByText("Linked to")).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage members" })).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByText("Unlinked. Manage members here in Flow again.")).toBeVisible();

    await page.goto(`/w/${team.workspace.id}/members`);
    await expect(page.getByRole("button", { name: "Generate link" })).toBeVisible();
  });

  test("personal workspaces can't be linked", async ({ page }) => {
    const { workspaces } = (await (await page.request.get("/api/workspaces")).json()) as {
      workspaces: Array<{ id: string; kind: string }>;
    };
    const personal = workspaces.find((w) => w.kind === "personal")!;
    const response = await page.request.post(`/api/workspaces/${personal.id}/space`, {
      data: { action: "create" },
    });
    expect(response.status()).toBe(400);
    await page.goto(`/w/${personal.id}/settings`);
    await expect(page.getByText("Share this team across Noirly apps")).toHaveCount(0);
  });
});
