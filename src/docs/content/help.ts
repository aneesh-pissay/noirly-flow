import type { DocArticle } from "@/src/docs/types";

const NO_VIDEO = "A reference page: each feature's own article has its walkthrough video.";

export const help: DocArticle[] = [
  {
    id: "troubleshooting",
    category: "help",
    kind: "guide",
    title: "Troubleshooting",
    summary: "The most common problems in Flow and how to fix them.",
    introduction:
      "Start here when something doesn't behave as expected. Most surprises come from three places: your role in the workspace, a filter you forgot was on, or an optional service the server doesn't have configured. Each feature's article has its own troubleshooting section too.",
    troubleshooting: [
      { problem: "Buttons are missing or fields are read-only", solution: "You're probably a Viewer in this workspace. Viewers see everything and change nothing. Ask an admin to change your role on the Members page." },
      { problem: "Tasks seem to be missing from a list", solution: "A search or filter is on. Choose Clear above the list. On Today and Upcoming, tasks from archived projects are left out." },
      { problem: "I can't mark a task done", solution: "It's blocked by an open task (see Blocked by in the drawer) or awaiting approval. Finish the blockers or resolve the approval." },
      { problem: "Changes from teammates appear late", solution: "Live updates need the realtime service. Without it, Flow refreshes every 30–60 seconds; reload to see changes now." },
      { problem: "Uploading a file fails", solution: "Files over 25 MB are refused; “Attachments aren't set up” means the server has no file storage configured." },
      { problem: "No emails arrive", solution: "Invites, mentions, assignments and reminders need SMTP on the server. Bell notifications and invite links work without email." },
      { problem: "“You're offline”", solution: "You can read pages you opened before, but changes need a connection. Reconnect and try again." },
      { problem: "An invite link says “Invite failed”", solution: "It was used, revoked, expired after 7 days, or emailed to a different address. Ask for a new one." },
      { problem: "Dates look a day off", solution: "Check Settings → Timezone, and remember filters and stats use your browser's local days." },
      { problem: "The page says “Workspace unavailable”", solution: "You were removed from the workspace, or it was deleted." },
    ],
    related: ["faq", "members-and-roles", "setup"],
    sources: ["docs/FEATURES.md", "src/server/api", "proxy.ts"],
    keywords: ["help", "problem", "error", "not working", "fix"],
    video: { unavailable: NO_VIDEO },
  },
  {
    id: "faq",
    category: "help",
    kind: "guide",
    title: "FAQ",
    summary: "Short answers to the questions people ask most about Flow.",
    introduction: "Quick answers. Follow the links to each feature's full article.",
    faqs: [
      { question: "Is my Personal workspace private?", answer: "Yes. Only you can see it, and it can't be shared, renamed or deleted." },
      { question: "What's the difference between a section and a column?", answer: "Columns are the board's stages and map to statuses. Sections group the list view by phase or area. A task has both." },
      { question: "What's the difference between a due date and a deadline?", answer: "The due date is when you plan to do it; the deadline is when it must be done. Both show on rows; the Gantt chart marks deadlines." },
      { question: "Do recurring tasks repeat if I cancel them?", answer: "No. Only completing (Done) creates the next occurrence." },
      { question: "Can clients see our board without editing it?", answer: "Yes — invite them as Viewers." },
      { question: "Can people outside Flow send us tasks?", answer: "Yes, with an intake form. Anyone with the link can respond, no account needed." },
      { question: "Can I get my data out?", answer: "Yes. Admins export everything as JSON; anyone can export tasks as CSV. Admins can also schedule backups." },
      { question: "Does Flow work offline?", answer: "Read-only: pages you opened before load offline. Changes need a connection." },
      { question: "Is there an API?", answer: "Yes. Create a personal API token under Settings → API tokens, and use webhooks for events." },
      { question: "Can I use Flow in my calendar?", answer: "Subscribe to the private .ics feed, or connect Google Calendar or Outlook for two-way sync." },
      { question: "Can automations trigger each other?", answer: "No. Changes made by a rule never set off other rules, so rules can't loop." },
      { question: "Is there a light theme?", answer: "Yes. Use the sun/moon button in the header, and pick a colour palette beside it." },
    ],
    related: ["troubleshooting", "overview", "keyboard-shortcuts"],
    sources: ["docs/FEATURES.md"],
    keywords: ["questions", "faq", "answers"],
    video: { unavailable: NO_VIDEO },
  },
];
