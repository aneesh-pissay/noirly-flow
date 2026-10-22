import { createTask, expect, openList, test, uid } from "./fixtures";

test.describe("layout preferences", () => {
  test("density and page width apply at once, follow the account, and survive a reload", async ({ page, team }) => {
    const reset = () => page.request.patch("/api/me", { data: { profile: { density: "comfortable", contentWidth: "standard" } } });
    await reset();
    try {
      await createTask(page.request, team.workspace.id, { title: `Dense ${uid()}`, projectId: team.project.id });
      await page.goto("/settings");
      await page.getByRole("radiogroup", { name: "Density" }).getByRole("radio", { name: /Compact/ }).click();
      await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
      await page.getByRole("radiogroup", { name: "Page width" }).getByRole("radio", { name: /Wide/ }).click();
      await expect(page.locator("html")).toHaveAttribute("data-width", "wide");
      await expect(page.getByText("Follows your account on every device.")).toBeVisible();
      const me = await (await page.request.get("/api/me")).json();
      expect(me.user.profile).toMatchObject({ density: "compact", contentWidth: "wide" });

      // Rows tighten and the page widens.
      await openList(page, team.url);
      const row = page.locator("[data-row]").first();
      await expect(row).toHaveCSS("padding-top", "6px");
      const container = page.locator("[data-content] .mx-auto.max-w-5xl").first();
      await expect(container).toHaveCSS("max-width", "none");
      await page.screenshot({ path: "test-results/layout-compact.png" });

      // Laid out before the profile arrives on the next load.
      await page.route("**/api/me", (route) => new Promise((resolve) => setTimeout(() => resolve(route.continue()), 1500)));
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
      await page.unroute("**/api/me");

      // And back.
      await page.goto("/settings");
      await page.getByRole("radiogroup", { name: "Density" }).getByRole("radio", { name: /Comfortable/ }).click();
      await page.getByRole("radiogroup", { name: "Page width" }).getByRole("radio", { name: /Standard/ }).click();
      await expect(page.locator("html")).not.toHaveAttribute("data-density", "compact");
      await expect(page.locator("html")).not.toHaveAttribute("data-width", "wide");
      await openList(page, team.url);
      await expect(page.locator("[data-row]").first()).toHaveCSS("padding-top", "12px");
      await expect(page.locator("[data-content] .mx-auto.max-w-5xl").first()).toHaveCSS("max-width", "1024px");
    } finally {
      await reset();
    }
  });
});
