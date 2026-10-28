# Docs system

The in-app Docs (`/docs`) explain every feature with an article, real screenshots and a
short tutorial video. This file is how it fits together and how to keep it current.

## Pieces

| Piece | Where | What it is |
| --- | --- | --- |
| Articles | `src/docs/content/*.ts` | One typed `DocArticle` per feature or guide (`src/docs/types.ts`). Plain data: no React, no server code. |
| Registry | `src/docs/registry.ts` | Category order, sidebar tree, URLs, previous/next, related links, media lookup. |
| Search | `src/docs/search.ts` | Client-side index over titles, summaries, steps, options, troubleshooting and FAQs. |
| Media manifest | `src/docs/media.json` | Written by the pipeline: screenshots, video, poster, captions, chapters, transcript, and the source fingerprint at capture time. |
| Inventory | `src/docs/inventory.json` | Written by `docs:scan --write`: every article with its sources, fingerprint and video status, plus every page, API route, feature module, settings section and e2e spec found in the code. The reviewed baseline. |
| UI | `app/(docs)/**`, `src/features/docs/*` | Public pages, linked from the landing page: in the app shell when signed in, under the marketing header when not (`@noirly-dev/ui`, tokens). Docs sidebar, article view, video player, "On this page" panel. |
| Capture | `docs-pipeline/capture/`, `playwright.docs.config.ts` | One Playwright scenario per article with a video. |
| Video | `docs-pipeline/video/` | Remotion compositions, kept as their own package so the app's dependencies don't change. |
| Published media | `public/docs/screenshots/<id>/`, `public/docs/videos/<id>.{jpg,vtt}` | Screenshots, posters and captions, committed. The MP4s are git-ignored and hosted separately. |

### Video hosting

The MP4s aren't committed. They live in Cloudflare R2 and play from the bucket's public URL,
`<R2_PUBLIC_URL>/doc-videos/<article-id>.mp4`, where `R2_PUBLIC_URL` is the bucket's Public
Development URL (`https://pub-<id>.r2.dev`) (`src/docs/video-host.ts`;
that origin is added to the CSP's `media-src`). After re-rendering, upload the changed
`docs-pipeline/video/out/<id>.mp4` files to `doc-videos/` under the same names. Without
`R2_PUBLIC_URL` (the e2e server, setups with no R2), videos are off and recorded articles show
"Video coming soon". Captions (`.vtt`) and posters stay in `public/docs/videos/` and load
from this app.

An article's `id` is its URL segment (`/docs/<category>/<id>`), its video's name and its
screenshot folder. `sources` lists the files it describes; their fingerprint
(`docs-pipeline/lib/fingerprint.ts`) ties code, text and media together.

## Article shape

Feature articles carry all eleven sections: introduction, problem, solution (with
highlights, in the style of the portfolio case study), use cases, step-by-step guide (steps
may point at a screenshot key), video walkthrough, options, permissions, advanced
capabilities, troubleshooting and related features. `src/docs/docs.test.ts` fails if one
is missing, a related link or source file doesn't exist, or a video is named after another
article. Write only what the code does; check labels against the components and e2e specs.

A feature that can't be recorded safely has `video: { unavailable: "<why>" }` and the page
says so. Nothing is faked.

## Recording safely

Captures run against the same isolated server as the e2e tests: a production build in
`.next-e2e` on port 3102, the `noirly-flow-e2e` database (wiped by `e2e/global-setup.ts`),
sessions minted with a test-only secret, no Noirly Identity, no realtime, email written to
files, and stand-ins for Google/Outlook and webhook receivers. Each scenario seeds its own
sample workspace through the API, deletes it afterwards, blurs secrets on screen (tokens,
signing secrets, private links), and states anything done off camera in the video.

## Commands

```bash
pnpm docs:video:install          # once: Remotion's own dependencies
pnpm docs:serve                  # build + serve the isolated app on :3102 (keep running)
pnpm docs:capture                # record every article (DOCS_ONLY=a,b to choose)
pnpm docs:render                 # captures → MP4, poster, captions, screenshots, media.json
pnpm docs:scan                   # compare code ↔ docs; report only
pnpm docs:regen                  # dry run: what is stale
pnpm docs:regen --run            # re-capture + re-render only the stale articles
pnpm docs:scan --write           # after reviewing, save the reviewed baseline
npx playwright test e2e/docs.spec.ts   # QA the Docs UI (needs the build to include current media)
```

Videos are 1920×1080, 30 FPS, H.264, caption-only (no narration): intro, use cases, an optional "how it works"
flowchart (`FLOWS` in `docs-pipeline/render.ts`), the real recording in a frame with a
drawn cursor, click highlights and captions, troubleshooting, and the result. Captions
(`.vtt`), chapters and the on-page transcript come from the same timeline
(`docs-pipeline/video/src/timeline.ts`), so they always line up.

## Regenerating after a change

1. `pnpm docs:scan` lists articles whose sources changed (review the text), code that no
   article covers (a new feature?), articles whose sources are gone (removed?), and stale
   or missing media.
2. Update the affected articles by hand (or ask Claude Code to, from the diff). Add a
   scenario in `docs-pipeline/capture/scenarios/` for a new article.
3. `pnpm docs:regen --run` re-records and re-renders only what's stale. A scenario that
   fails publishes nothing and keeps the old media; `docs-pipeline/.captures/regen-report.md`
   lists what was regenerated and what couldn't be verified.
4. `pnpm docs:scan --write` once the text is reviewed. Nothing is ever marked current
   automatically.
5. Rebuild and run `e2e/docs.spec.ts`. Next serves only the `public/` files present at
   build time.

`NOT_DOCUMENTED` in `docs-pipeline/scan.ts` lists code with no user-facing web feature, and why.
