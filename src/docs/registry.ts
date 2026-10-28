import type { ArticleMedia, CategoryId, DocArticle, DocCategory, MediaManifest } from "@/src/docs/types";
import media from "@/src/docs/media.json";
import { docsVideoBaseUrl } from "@/src/docs/video-host";
import { gettingStarted } from "@/src/docs/content/getting-started";
import { workspaces } from "@/src/docs/content/workspaces";
import { projects } from "@/src/docs/content/projects";
import { tasks } from "@/src/docs/content/tasks";
import { views } from "@/src/docs/content/views";
import { planning } from "@/src/docs/content/planning";
import { productivity } from "@/src/docs/content/productivity";
import { advanced } from "@/src/docs/content/advanced";
import { integrations } from "@/src/docs/content/integrations";
import { settings } from "@/src/docs/content/settings";
import { help } from "@/src/docs/content/help";

/** Sidebar order. */
export const CATEGORIES: DocCategory[] = [
  { id: "getting-started", title: "Getting started", blurb: "What Flow is, how to sign in, and how to find your way around." },
  { id: "workspaces", title: "Workspaces & teams", blurb: "Personal and team workspaces, members, roles and invites." },
  { id: "projects", title: "Projects", blurb: "Organise work into projects with sections, columns and chat." },
  { id: "tasks", title: "Tasks", blurb: "Create, schedule and finish tasks, alone or together." },
  { id: "views", title: "Views", blurb: "The same tasks as a list, a board, a calendar, a Gantt chart or a timeline." },
  { id: "planning", title: "Planning & insights", blurb: "Filters, goals, habits, reviews, stats and team capacity." },
  { id: "productivity", title: "Productivity", blurb: "Move fast with search, focus sessions, timers and notifications." },
  { id: "advanced", title: "Advanced features", blurb: "Automations, approvals, dependencies, custom fields, templates and bulk edits." },
  { id: "integrations", title: "Integrations", blurb: "Forms, webhooks, API tokens, calendars, import and export." },
  { id: "settings", title: "Settings", blurb: "Your profile, how tasks save, layout, themes and the installable app." },
  { id: "help", title: "Help", blurb: "Fixes for common problems and answers to common questions." },
];

const BY_CATEGORY: Record<CategoryId, DocArticle[]> = {
  "getting-started": gettingStarted,
  workspaces,
  projects,
  tasks,
  views,
  planning,
  productivity,
  advanced,
  integrations,
  settings,
  help,
};

/** Every article, in reading order. */
export const ARTICLES: DocArticle[] = CATEGORIES.flatMap((category) => BY_CATEGORY[category.id]);

const INDEX = new Map(ARTICLES.map((article) => [article.id, article]));

export function getArticle(id: string): DocArticle | undefined {
  return INDEX.get(id);
}

export function getCategory(id: string): DocCategory | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

export function articlesIn(category: CategoryId): DocArticle[] {
  return BY_CATEGORY[category];
}

export function articleHref(article: Pick<DocArticle, "id" | "category">): string {
  return `/docs/${article.category}/${article.id}`;
}

export function categoryHref(category: CategoryId): string {
  return `/docs/${category}`;
}

/** The articles either side in reading order. */
export function neighbours(id: string): { previous?: DocArticle; next?: DocArticle } {
  const at = ARTICLES.findIndex((article) => article.id === id);
  return { previous: ARTICLES[at - 1], next: ARTICLES[at + 1] };
}

export function relatedArticles(article: DocArticle): DocArticle[] {
  return (article.related ?? []).map((id) => INDEX.get(id)).filter((a): a is DocArticle => Boolean(a));
}

const MEDIA = media as MediaManifest;

/** Where the tutorial MP4s play from (see video-host.ts). Posters and captions stay in /public. */
export const VIDEO_BASE_URL = docsVideoBaseUrl();
export const VIDEOS_ENABLED = Boolean(VIDEO_BASE_URL);

/** What the pipeline captured, exactly as recorded in media.json. */
export function capturedMediaFor(id: string): ArticleMedia | undefined {
  return MEDIA[id];
}

/** The article's media as the Docs should show it: video only when a host is configured. */
export function mediaFor(id: string): ArticleMedia | undefined {
  const captured = MEDIA[id];
  if (!captured?.video) return captured;
  if (!VIDEOS_ENABLED) {
    const shown = { ...captured };
    delete shown.video;
    return shown;
  }
  return { ...captured, video: { ...captured.video, src: `${VIDEO_BASE_URL}/${id}.mp4` } };
}

/** A video was rendered for this article but isn't being served yet. */
export function videoPending(id: string): boolean {
  return !VIDEOS_ENABLED && Boolean(MEDIA[id]?.video || ("scenario" in (getArticle(id)?.video ?? {})));
}

/** The sidebar tree, small enough to hand to a client component. */
export type NavCategory = {
  id: CategoryId;
  title: string;
  href: string;
  articles: { id: string; title: string; summary: string; href: string }[];
};

export function navTree(): NavCategory[] {
  return CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    href: categoryHref(category.id),
    articles: BY_CATEGORY[category.id].map((article) => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      href: articleHref(article),
    })),
  }));
}
