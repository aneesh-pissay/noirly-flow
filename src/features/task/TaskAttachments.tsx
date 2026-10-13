"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { TaskAttachment } from "@/src/core/sync/types";
import { useWorkspaceRole } from "@/src/features/workspace/WorkspaceRoleContext";

const MAX_BYTES = 25 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Optional files on a task: none is the normal state, adding is one click or a drop. */
export function TaskAttachments({ taskId, canWrite }: { taskId: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const role = useWorkspaceRole();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 60_000 });
  const query = useQuery({
    queryKey: qk.attachments(taskId),
    queryFn: () => api.listAttachments(taskId),
  });
  const attachments = query.data?.attachments ?? [];
  const canModerate = role === "admin" || role === "owner";

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.deleteAttachment(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<{ attachments: TaskAttachment[] }>(qk.attachments(taskId), (old) =>
        old ? { attachments: old.attachments.filter((a) => a.id !== id) } : old,
      );
    },
    onError: (err: Error) => setError(err.message),
  });

  async function upload(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files);
    const tooBig = list.filter((f) => f.size > MAX_BYTES);
    if (tooBig.length) {
      setError(`${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over 25 MB.`);
    }
    // One at a time keeps each request under the server's size limit.
    for (const file of list.filter((f) => f.size <= MAX_BYTES)) {
      setUploading((names) => [...names, file.name]);
      try {
        const { attachment } = await api.uploadAttachment(taskId, file);
        queryClient.setQueryData<{ attachments: TaskAttachment[] }>(qk.attachments(taskId), (old) => ({
          attachments: [...(old?.attachments ?? []), attachment],
        }));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading((names) => names.filter((name) => name !== file.name));
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
  }

  return (
    <section
      aria-labelledby={`attachments-${taskId}`}
      onDragOver={(event) => {
        if (!canWrite) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!canWrite) return;
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length) void upload(event.dataTransfer.files);
      }}
      className={`rounded-lg transition-colors ${dragging ? "bg-[var(--accent-soft)] outline outline-1 outline-[var(--accent)]" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p
          id={`attachments-${taskId}`}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]"
        >
          Attachments{attachments.length ? ` · ${attachments.length}` : ""}
        </p>
        {canWrite ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <Paperclip size={12} aria-hidden />
            Attach files
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          aria-label="Attach files"
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {attachments.length === 0 && uploading.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          {query.isPending ? "Loading…" : canWrite ? "No attachments. Drop files here or attach them." : "No attachments."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((attachment) => {
            const Icon = attachment.mime.startsWith("image/") ? ImageIcon : FileText;
            const canRemove = canWrite && (attachment.uploadedById === meQuery.data?.user.id || canModerate);
            return (
              <li
                key={attachment.id}
                className="group flex items-center gap-2 border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2"
              >
                <Icon size={14} aria-hidden className="shrink-0 text-[var(--muted-foreground)]" />
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)] hover:underline"
                  title={attachment.filename}
                >
                  {attachment.filename}
                </a>
                <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
                  {formatSize(attachment.sizeBytes)}
                </span>
                {canRemove ? (
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.filename}`}
                    onClick={() => removeMutation.mutate(attachment.id)}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-[var(--muted-foreground)] hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X size={13} aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
          {uploading.map((name) => (
            <li
              key={`up-${name}`}
              className="flex items-center gap-2 border border-dashed border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted-foreground)]"
            >
              <span className="busy-dots" aria-hidden>
                ···
              </span>
              <span className="truncate">Uploading {name}</span>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="mt-2 text-xs text-[var(--foreground)]">{error}</p>
      ) : null}
    </section>
  );
}
