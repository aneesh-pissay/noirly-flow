"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { can } from "@/src/core/permissions/can";
import { useUIStore } from "@/src/stores/ui-store";
import type { TaskPriority, TaskStatus } from "@/src/core/models/enums";
import { dueInputToIso } from "./dates";
import { TaskDatePicker } from "./TaskDatePicker";

const fieldClass = "mt-1 w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;

export function TaskCreateDialog({ draft }: {
  draft: { workspaceId: string; projectId: string | null; title: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const close = useUIStore((state) => state.closeTaskForm);
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(draft.projectId ?? "");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const workspace = useQuery({ queryKey: qk.workspace(draft.workspaceId), queryFn: () => api.getWorkspace(draft.workspaceId) });
  const members = useQuery({ queryKey: qk.members(draft.workspaceId), queryFn: () => api.listMembers(draft.workspaceId) });
  const canWrite = Boolean(workspace.data && can(workspace.data.workspace.role, "task.write"));
  const dirty = Boolean(title || description || dueDate || assigneeIds.length || attachments.length || status !== "todo" || priority !== "none" || projectId !== (draft.projectId ?? ""));
  const create = useMutation({
    mutationFn: async () => {
      const result = await api.createTask(draft.workspaceId, {
        title: title.trim(), description: description.trim() || null, projectId: projectId || null,
        status, priority, dueAt: dueInputToIso(dueDate, dueTime), dueHasTime: Boolean(dueDate && dueTime), assigneeIds,
      });
      const failed: string[] = [];
      for (const [index, file] of attachments.entries()) {
        setUploadProgress(`Uploading attachment ${index + 1} of ${attachments.length}…`);
        try { await api.uploadAttachment(result.task.id, file); }
        catch { failed.push(file.name); }
      }
      setUploadProgress("");
      return { ...result, failedAttachments: failed };
    },
    onSuccess: ({ task, failedAttachments }) => {
      if (failedAttachments.length) {
        window.alert(`The task was created, but these attachments could not be uploaded: ${failedAttachments.join(", ")}. You can add them from the task.`);
      }
      void queryClient.invalidateQueries({ queryKey: ["tasks", draft.workspaceId] });
      queryClient.setQueryData(qk.task(task.id), { task });
      close();
      router.push(`/w/${draft.workspaceId}/${task.projectId ? `p/${task.projectId}` : "inbox"}?task=${task.id}`);
    },
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    if (!dirty && !create.isPending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, create.isPending]);

  function dismiss() {
    if (create.isPending) return;
    if (dirty && !window.confirm("Discard this unsaved task?")) return;
    close();
  }

  return (
    <dialog ref={dialog} aria-labelledby="create-task-title" data-lenis-prevent
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-0 text-[var(--foreground)] shadow-xl backdrop:bg-black/50">
      <form onSubmit={(event) => { event.preventDefault(); if (title.trim() && canWrite && !create.isPending) create.mutate(); }}>
        <header className="flex items-center justify-between border-b border-[var(--hairline)] p-5">
          <div><h2 id="create-task-title" className="text-xl font-semibold">Create task</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Only the title is required.</p></div>
          <button type="button" onClick={dismiss} disabled={create.isPending} className="min-h-10 px-3 disabled:opacity-50">Cancel</button>
        </header>
        <fieldset disabled={create.isPending || !canWrite} className="space-y-4 p-5 disabled:opacity-60">
          <label className="block text-sm">Title <span aria-hidden="true">*</span>
            <input name="title" required maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-sm">Description
            <textarea name="description" rows={4} maxLength={20000} value={description} onChange={(event) => setDescription(event.target.value)} className={fieldClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">Project
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={fieldClass}>
                <option value="">Inbox</option>
                {(workspace.data?.projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Status
              <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} className={fieldClass}>
                <option value="todo">Todo</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="text-sm">Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className={fieldClass}>
                <option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <div className="text-sm sm:col-span-2"><span>Due date</span><TaskDatePicker value={dueDate} time={dueTime} onChange={(date, time) => { setDueDate(date); setDueTime(time); }} /></div>
          </div>
          <fieldset><legend className="text-sm">Assignees</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(members.data?.members ?? []).map((member) => <label key={member.userId} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--hairline)] px-3 text-sm">
                <input type="checkbox" checked={assigneeIds.includes(member.userId)} onChange={(event) => setAssigneeIds((ids) => event.target.checked ? [...ids, member.userId] : ids.filter((id) => id !== member.userId))} />{member.displayName}
              </label>)}
            </div>
            {members.isPending ? <p className="mt-2 text-sm">Loading members…</p> : null}
            {members.isError ? <p role="alert" className="mt-2 text-sm">Could not load assignees. <button type="button" onClick={() => void members.refetch()} className="underline">Retry</button></p> : null}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm">Attachments <span className="text-[var(--muted-foreground)]">(optional)</span></legend>
            <p className="text-xs text-[var(--muted-foreground)]">Attach up to {MAX_ATTACHMENTS} files, 25 MB each.</p>
            <input ref={attachmentInput} type="file" multiple hidden aria-label="Choose task attachments"
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? []);
                const oversized = chosen.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
                const next = [...attachments, ...chosen.filter((file) => file.size <= MAX_ATTACHMENT_BYTES)];
                setAttachmentError(oversized.length ? `${oversized.map((file) => file.name).join(", ")} exceed the 25 MB limit.` : "");
                if (next.length > MAX_ATTACHMENTS) setAttachmentError(`A task can have up to ${MAX_ATTACHMENTS} attachments.`);
                else setAttachments(next);
                event.target.value = "";
              }} />
            <button type="button" onClick={() => attachmentInput.current?.click()}
              className="min-h-10 rounded-xl border border-[var(--hairline)] px-3 text-sm hover:bg-[var(--bg)]">
              Choose files
            </button>
            {attachments.length ? <ul className="space-y-1">
              {attachments.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{file.name}</span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((files) => files.filter((_, i) => i !== index))} className="shrink-0 underline">Remove</button>
              </li>)}
            </ul> : null}
            {attachmentError ? <p role="alert" className="text-xs">{attachmentError}</p> : null}
          </fieldset>
        </fieldset>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] p-5">
          <div role="status" className="text-sm text-[var(--muted-foreground)]">{workspace.isPending ? "Loading workspace…" : uploadProgress || (create.isPending ? "Creating task…" : "Not created yet")}</div>
          <button type="submit" disabled={!title.trim() || !canWrite || create.isPending || Boolean(attachmentError)} className="min-h-10 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-50">{create.isPending ? uploadProgress ? "Attaching…" : "Creating…" : "Create task"}</button>
          {workspace.isError ? <p role="alert" className="w-full text-sm">Could not load workspace. <button type="button" className="underline" onClick={() => void workspace.refetch()}>Retry</button></p> : null}
          {workspace.data && !canWrite ? <p role="alert" className="w-full text-sm">You do not have permission to create tasks here.</p> : null}
          {create.isError ? <p role="alert" className="w-full text-sm">{create.error.message}</p> : null}
        </footer>
      </form>
    </dialog>
  );
}
