import { test as base } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ARTICLES, CATEGORIES, articleHref, mediaFor, navTree, VIDEOS_ENABLED } from "@/src/docs/registry";

test.describe("docs", () => {
  test("every sidebar link opens its page, with breadcrumb and previous/next", async ({ page }) => {
    test.setTimeout(240_000);
    for (const category of navTree()) {
      await page.goto(category.href);
      await expect(page.getByRole("heading", { level: 1, name: category.title })).toBeVisible();
      for (const article of category.articles) {
        await page.goto(article.href);
        await expect(page.getByRole("heading", { level: 1, name: article.title, exact: true })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(category.title);
        await expect(page.getByRole("navigation", { name: "Docs sections" }).getByRole("link", { name: article.title, exact: true })).toHaveAttribute("aria-current", "page");
        await expect(page.getByRole("navigation", { name: "Previous and next" })).toBeVisible();
      }
    }
  });

  test("feature pages carry all their sections", async ({ page }) => {
    for (const article of ARTICLES.filter((a) => a.kind === "feature").slice(0, 8)) {
      await page.goto(articleHref(article));
      for (const id of ["introduction", "problem", "solution", "use-cases", "guide", "video", "options", "permissions", "advanced", "troubleshooting", "related"]) {
        await expect(page.locator(`section#${id}`), `${article.id} #${id}`).toBeVisible();
      }
    }
  });

  test("each video belongs to its article, plays, and has captions and chapters", async ({ page }) => {
    test.setTimeout(240_000);
    const withVideo = ARTICLES.filter((article) => mediaFor(article.id)?.video);
    test.skip(!VIDEOS_ENABLED || !withVideo.length, "Videos are off without R2_PUBLIC_URL (the e2e server has no R2)");
    for (const article of withVideo) {
      await page.goto(articleHref(article));
      const player = page.locator("[data-video-player]");
      // Nothing loads until Play.
      await expect(player.locator("video")).toHaveCount(0);
      await player.getByRole("button", { name: `Play video: ${article.title}` }).click();
      const video = player.locator("video");
      await expect(video).toHaveAttribute("src", mediaFor(article.id)!.video!.src);
      expect(mediaFor(article.id)!.video!.src).toMatch(new RegExp(`/${article.id}\\.mp4$`));
      await expect(video.locator("track")).toHaveAttribute("src", `/docs/videos/${article.id}.vtt`);
      await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.3);
      await player.getByRole("button", { name: "Pause" }).click();
      await player.getByRole("button", { name: "Chapters" }).click();
      await expect(player.getByRole("list", { name: "Chapters" }).getByRole("button", { name: /Walkthrough/ })).toBeVisible();
    }
    const vtt = await page.request.get(`/docs/videos/${withVideo[0]!.id}.vtt`);
    expect(vtt.ok()).toBe(true);
    expect(await vtt.text()).toMatch(/^WEBVTT/);
  });

  test("with no video host configured, recorded features say their video is coming", async ({ page }) => {
    test.skip(VIDEOS_ENABLED, "A video host is configured");
    await page.goto("/docs/tasks/quick-add");
    await expect(page.getByText("Video coming soon")).toBeVisible();
    await expect(page.locator("[data-video-player]")).toHaveCount(0);
  });

  test("features that can't be shown say why instead of faking a video", async ({ page }) => {
    for (const article of ARTICLES.filter((a) => "unavailable" in a.video)) {
      await page.goto(articleHref(article));
      await expect(page.getByText("Video unavailable")).toBeVisible();
    }
  });

  test("search finds features, steps and fixes, and opens them", async ({ page }) => {
    await page.goto("/docs");
    const search = page.getByRole("combobox", { name: "Search the docs" }).first();
    await search.fill("webhooks");
    await expect(page.getByRole("option").first()).toContainText("Webhooks");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/docs\/integrations\/webhooks$/);

    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.fill("invite failed");
    await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("Troubleshooting");
    await search.fill("zebra quantum");
    await expect(page.getByRole("status").filter({ hasText: "No results" })).toBeVisible();
  });

  test("article URLs load directly and only under their own category", async ({ page }) => {
    await page.goto("/docs/tasks/quick-add#troubleshooting");
    await expect(page.getByRole("heading", { level: 1, name: "Quick add" })).toBeVisible();
    await page.goto("/docs/views/quick-add");
    await expect(page.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();
    await page.goto("/docs/nope");
    await expect(page.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();
  });

  test("Docs is in the main navigation and the command palette", async ({ page, team }) => {
    await page.goto(team.url);
    await page.getByRole("link", { name: "Docs", exact: true }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { level: 1, name: "Flow, explained." })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("Create a task, search, or jump…").fill("documentation");
    await page.getByRole("option", { name: "Docs", exact: true }).click();
    await expect(page).toHaveURL(/\/docs$/);
  });

  test("on a phone the sidebar is a drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/docs/tasks/quick-add");
    await expect(page.getByRole("complementary", { name: "Documentation" })).toBeHidden();
    await page.getByRole("button", { name: "Browse docs" }).click();
    const drawer = page.getByRole("dialog", { name: "Documentation" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Expand Views" }).click();
    await drawer.getByRole("link", { name: "Board view" }).click();
    await expect(page).toHaveURL(/\/docs\/views\/board-view$/);
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("every category is reachable from the docs home", async ({ page }) => {
    await page.goto("/docs");
    for (const category of CATEGORIES) {
      await expect(page.getByRole("link", { name: category.title, exact: true }).first()).toBeVisible();
    }
  });
});

base.describe("docs, signed out", () => {
  base("the landing page links to the docs, which open without signing in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Browse the docs" }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { level: 1, name: "Flow, explained." })).toBeVisible();
    await page.goto("/docs/tasks/quick-add");
    await expect(page.getByRole("heading", { level: 1, name: "Quick add" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Sign in" })).toBeVisible();
    // The site's smooth scroll mustn't swallow the wheel over the docs panes.
    const main = page.locator("#docs-main");
    const box = (await main.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});
