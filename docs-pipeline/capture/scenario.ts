import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { E2EUser } from "../../e2e/env";
import type { Api } from "./api";
import type { Recorder } from "./recorder";

export type Ctx<T> = { page: Page; rec: Recorder; api: Api; data: T; context: BrowserContext; browser: Browser };

export type Scenario<T = unknown> = {
  /** Who the recording is signed in as (a fresh session each time). Default: the owner. */
  user?: E2EUser;
  /** Seeds data through the API before the page opens, so setup isn't filmed. */
  setup?: (api: Api) => Promise<T>;
  run: (ctx: Ctx<T>) => Promise<void>;
};

/** Keeps `setup`'s return type flowing into `run`. */
export function scenario<T>(definition: Scenario<T>): Scenario<unknown> {
  return definition as Scenario<unknown>;
}

/** The task drawer (the panel holding the description box). */
export const drawer = (page: Page) => page.locator("aside", { has: page.getByPlaceholder("Add a description…") });

/** The list row whose title button matches. */
export const row = (page: Page, title: string) => page.locator("li", { has: page.getByRole("button", { name: title, exact: true }) });

export async function waitForTasks(page: Page) {
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText("Loading tasks…")).toBeHidden();
}

/** Opens a project page in list view (projects open on the board). */
export async function openList(page: Page, url: string) {
  await page.goto(url);
  await waitForTasks(page);
  await page.getByRole("button", { name: "List", exact: true }).click();
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A task's title button in any view (board cards add their chips to the name, so match the start). */
export const titleButton = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${escape(title)}`) }).first();

/** Opens a task's drawer from wherever its title is a button, and waits for it to load. */
export async function openTask(page: Page, title: string) {
  await titleButton(page, title).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByRole("textbox", { name: "Task title" })).toHaveValue(title);
}

/** Blurs secrets on screen (tokens, signing secrets, private links) before they appear. */
export async function blur(page: Page, selector: string) {
  const css = `${selector} { filter: blur(6px) !important; }`;
  // On every page this tab loads from now on, and on the current one.
  await page.addInitScript((rule) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = rule;
      document.head.append(style);
    });
  }, css);
  if (page.url().startsWith("http")) await page.addStyleTag({ content: css });
}

/** A board column: the container two levels above its <h3> title. */
export const column = (page: Page, name: string) => page.getByRole("heading", { level: 3, name, exact: true }).locator("xpath=../..");
