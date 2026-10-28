import type { DocArticle } from "@/src/docs/types";

export const projects: DocArticle[] = [
  {
    id: "projects",
    category: "projects",
    kind: "feature",
    title: "Projects",
    summary: "Create projects, then rename, colour, favourite, archive or delete them from the sidebar.",
    location: "Workspace sidebar → Projects",
    introduction:
      "Projects group related tasks inside a workspace. Each project has its own board columns, sections, custom fields, automations, intake forms and chat. Tasks that don't belong to any project live in the workspace's Inbox.",
    problem: "A long single list mixes every stream of work; finished initiatives clutter the sidebar long after they're done.",
    solution:
      "Flow makes projects cheap to create and easy to tidy. A colour dot helps you scan, stars pin favourites to the top, and archiving hides a finished project and its tasks from Today, Upcoming, filters and calendar feeds without deleting anything.",
    highlights: ["Create a project in one line", "Eight colours and favourites", "Archive hides a project and its tasks everywhere", "Start from a project template"],
    useCases: [
      { title: "Quarterly initiative", body: "Create “Q3 Launch”, star it while it's hot, archive it when it ships." },
      { title: "Repeatable projects", body: "Save a project as a template and spin up the next one with its sections and tasks." },
    ],
    steps: [
      { title: "Create a project", body: "In the workspace sidebar, choose New, type a Project name (optionally pick a template) and choose Add.", shot: "create" },
      { title: "Star it", body: "Hover the project and choose its star (Add … to favourites) to list it under Favourites.", shot: "favourite" },
      { title: "Edit it", body: "Hover the project and choose its pencil (Edit …) to rename it, pick a colour, archive or delete it.", shot: "edit" },
      { title: "Unarchive", body: "Open Archived (n) at the bottom of the project list, open the project, and choose Unarchive on the banner." },
    ],
    options: [
      { name: "New", description: "Creates a project with Todo, In progress and Done columns, or from a project template." },
      { name: "Star", description: "Adds the project to your personal Favourites list at the top of the sidebar." },
      { name: "Colour", description: "Eight colours or none; shown as a dot before the name." },
      { name: "Archive / Unarchive", description: "Hides the project and its tasks from the sidebar, Today, Upcoming, filters and the calendar feed." },
      { name: "Delete", description: "Deletes the project and its tasks (admins)." },
      { name: "Save as template", description: "In the edit menu: saves sections, open tasks and subtasks as a template." },
    ],
    permissions: [
      { who: "Viewer", can: "Open projects." },
      { who: "Member", can: "Create, rename, colour, archive projects." },
      { who: "Admin, Owner", can: "Also delete projects." },
      { who: "Everyone", can: "Keep their own favourites." },
    ],
    advanced: [
      "Archived projects still open from their URL, with a banner to unarchive.",
      "Each project remembers its own default view (Make default next to the view buttons).",
      "Favourites are personal — teammates keep their own.",
    ],
    troubleshooting: [
      { problem: "There's no Delete in the edit menu", solution: "Deleting projects needs Admin or Owner." },
      { problem: "A project's tasks vanished from Today", solution: "The project is archived. Unarchive it to bring its tasks back." },
    ],
    related: ["sections", "board-columns", "templates", "workspaces"],
    sources: ["src/features/workspace/ProjectNav.tsx", "src/features/workspace/ArchivedProjectBanner.tsx", "src/server/favorites.ts", "app/api/projects/[projectId]/route.ts", "app/api/me/favorite-projects", "app/api/workspaces/[workspaceId]/projects"],
    keywords: ["project", "archive", "favourite", "favorite", "colour", "color"],
    video: { scenario: "projects" },
  },
  {
    id: "sections",
    category: "projects",
    kind: "feature",
    title: "Sections",
    summary: "Group a project's list into named sections, separate from board columns.",
    location: "Project → List view",
    introduction:
      "Sections divide a project's list view into named groups, like “Planning” and “Build”. They're independent of board columns, so a task can be in the Planning section and the In progress column at once.",
    problem: "Board columns track progress, but a long project also needs grouping by phase or area, and squeezing both into columns breaks the board.",
    solution:
      "Flow keeps sections and columns separate. Add sections under the list, rename or delete them from their header, and set a task's section in the drawer or new-task dialog. Deleting a section never deletes tasks — they move to No section.",
    highlights: ["Independent of board columns", "Rename and delete from the header", "Deleting keeps the tasks", "Pick a section when creating a task"],
    useCases: [
      { title: "Phased launch", body: "Sections for Planning, Build and Launch, with status tracked on the board." },
      { title: "Imported structure", body: "Todoist sections become Flow sections on import." },
    ],
    steps: [
      { title: "Switch to the list", body: "Open a project and choose List.", shot: "list" },
      { title: "Add a section", body: "Choose + Add section under the list, type a New section name and choose Add section.", shot: "add" },
      { title: "Put a task in it", body: "Open the task and pick its Section in the drawer.", shot: "grouped" },
      { title: "Rename or delete", body: "Use Rename section or Delete section on its header. Deleting keeps the tasks under No section." },
    ],
    options: [
      { name: "+ Add section", description: "Adds a named section at the end of the list." },
      { name: "Rename section", description: "Edits its name." },
      { name: "Delete section", description: "Removes the section; its tasks move to No section." },
      { name: "Section (drawer and new-task dialog)", description: "Which section a task is in." },
    ],
    permissions: [
      { who: "Viewer", can: "See sections." },
      { who: "Member and up", can: "Add, rename and delete sections; move tasks between them." },
    ],
    advanced: [
      "Moving a task to another project clears its section; a section from a different project is refused.",
      "No section is listed first when a project has sections.",
    ],
    troubleshooting: [
      { problem: "I can't see sections on the board", solution: "Sections belong to the list view; the board groups by column." },
    ],
    related: ["board-columns", "list-view", "projects", "import"],
    sources: ["src/features/task/ProjectSections.tsx", "src/features/task/TaskSections.tsx", "src/server/sections.ts", "app/api/projects/[projectId]/sections", "app/api/sections"],
    keywords: ["groups", "phases"],
    video: { scenario: "sections" },
  },
  {
    id: "board-columns",
    category: "projects",
    kind: "feature",
    title: "Board columns",
    summary: "Add, rename, reorder and delete a project's board columns, each tied to a status.",
    location: "Project → Board view",
    introduction:
      "Every project starts with three columns: Todo, In progress and Done. Add more for your process — Review, QA, Waiting — and tell Flow which status cards in that column have.",
    problem: "Teams need more stages than “to do, doing, done”, but extra stages shouldn't break reports, filters or automations that rely on status.",
    solution:
      "Each Flow column maps to one of the statuses. A Review column can be “in progress” as far as everything else is concerned, so Today, stats and automations keep working while the board reflects your real process. Every status always keeps at least one column.",
    highlights: ["Columns mapped to statuses", "Add columns from the board", "Rename and reorder", "Each status keeps one column"],
    useCases: [
      { title: "Code review", body: "Add “Review” (in progress) between In progress and Done." },
      { title: "Waiting on others", body: "Add “Waiting” so blocked work is visible on the board." },
    ],
    steps: [
      { title: "Open the board", body: "Open a project; it opens on the board unless its default view is different.", shot: "board" },
      { title: "Add a column", body: "Choose Add column, type the Column name, set Cards here are to a status and choose Add.", shot: "add" },
      { title: "Move cards into it", body: "Drag a card by its grip into the new column." },
    ],
    options: [
      { name: "Add column", description: "A new column at the end, with a name and the status its cards take." },
      { name: "Cards here are", description: "The status cards get when dropped in the column." },
      { name: "Edit column", description: "Opens the column's settings: its name, the status its cards take, Left / Right and Delete. Save keeps a new name." },
      { name: "Left / Right", description: "In Edit column: moves the column one place along the board." },
      { name: "Delete", description: "Removes the column after a confirmation; its cards move to another column with the same status. The only column for a status can't be deleted." },
    ],
    permissions: [
      { who: "Viewer", can: "See the board." },
      { who: "Member and up", can: "Add, rename, reorder and delete columns; move cards." },
    ],
    advanced: [
      "Deleting a column moves its cards to another column with the same status.",
      "Canceled tasks don't appear on the board.",
    ],
    troubleshooting: [
      { problem: "Delete refuses on a column", solution: "It's the last column for its status. Add another column for that status first." },
    ],
    related: ["board-view", "workspace-settings", "automations"],
    sources: ["src/features/task/TaskBoard.tsx", "app/api/projects/[projectId]/columns", "app/api/columns"],
    keywords: ["kanban", "column", "stages", "workflow"],
    video: { scenario: "board-columns" },
  },
  {
    id: "project-chat",
    category: "projects",
    kind: "feature",
    title: "Project chat",
    summary: "A chat room per project, so conversation sits next to the work.",
    location: "Project header → Chat",
    introduction:
      "Every project has its own chat. Open it from Chat in the project header to talk with everyone on the project. Messages are kept, older ones load on demand, and teammates see new messages without reloading.",
    problem: "Project talk scattered across email and chat apps loses context, and new people can't see the history.",
    solution:
      "Flow puts a chat beside each project. It's scoped to the project, so the right people see it; viewers can read along without posting; and authors (or admins) can delete messages.",
    highlights: ["One chat per project", "Enter to send, Shift+Enter for a new line", "Live updates between teammates", "Viewers read along"],
    useCases: [
      { title: "Kickoff notes", body: "Post the plan in the project chat so latecomers can scroll back." },
      { title: "Quick questions", body: "Ask about a column move without opening a task." },
    ],
    steps: [
      { title: "Open chat", body: "In a project, choose Chat in the header.", shot: "open" },
      { title: "Send a message", body: "Type in Message and press Enter (Shift+Enter adds a line).", shot: "sent" },
      { title: "Delete your message", body: "Hover it and choose Delete message." },
    ],
    options: [
      { name: "Message", description: "Enter sends; Shift+Enter adds a new line." },
      { name: "Send", description: "Sends the message." },
      { name: "Delete message", description: "Your own messages; admins can delete anyone's." },
      { name: "Load earlier messages", description: "Long chats load older messages on demand." },
    ],
    permissions: [
      { who: "Viewer", can: "Read the chat but not post." },
      { who: "Member", can: "Post and delete their own messages." },
      { who: "Admin, Owner", can: "Also delete others' messages." },
      { who: "Outsiders", can: "Nothing — the chat is private to the workspace." },
    ],
    advanced: ["With realtime configured, messages arrive instantly; otherwise they appear on the next refresh."],
    troubleshooting: [
      { problem: "There's no message box", solution: "You're a Viewer in this workspace." },
      { problem: "Teammates' messages appear late", solution: "The server may not have realtime configured; messages still arrive on refresh." },
    ],
    related: ["comments-and-mentions", "projects", "notifications"],
    sources: ["src/features/chat/ProjectChat.tsx", "src/server/chat", "app/(app)/w/[workspaceId]/p/[projectId]/chat", "app/api/projects/[projectId]/messages"],
    keywords: ["chat", "messages", "discussion"],
    video: { scenario: "project-chat" },
  },
];
