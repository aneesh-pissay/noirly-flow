"use client";

import { useState, type FormEvent } from "react";
import type { PublicForm } from "@/src/core/forms";

const fieldClass = "w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--foreground)] aria-[invalid=true]:border-[var(--accent)]";

/** The fill-in side of an intake form, for people without an account. */
export function PublicFormView({ publicId, form }: { publicId: string; form: PublicForm }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [failure, setFailure] = useState<string | null>(null);
  // An answer being edited is no longer the one the error was about.
  const clear = (id: string) => setErrors((old) => {
    if (!old[id]) return old;
    const next = { ...old };
    delete next[id];
    return next;
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    setFailure(null);
    try {
      const response = await fetch(`/api/forms/public/${publicId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Noirly-CSRF": "1" },
        body: JSON.stringify({ title, details, answers, website }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 422 && body.errors) {
        setErrors(body.errors as Record<string, string>);
        setState("idle");
        return;
      }
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Something went wrong. Try again.");
      setState("sent");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Something went wrong. Try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <section aria-live="polite" className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Thanks, it&apos;s in</h1>
        <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted-foreground)]">{form.confirmation ?? "Your response was sent."}</p>
        <button type="button" className="mt-4 text-sm underline" onClick={() => {
          setTitle(""); setDetails(""); setAnswers({}); setErrors({}); setState("idle");
        }}>
          Send another
        </button>
      </section>
    );
  }

  const field = (id: string, label: string, required: boolean, control: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`q-${id}`} className="text-sm font-medium text-[var(--foreground)]">
        {label}{required ? <span aria-hidden className="text-[var(--accent)]"> *</span> : null}
      </label>
      {control({ id: `q-${id}`, "aria-invalid": Boolean(errors[id]), "aria-describedby": errors[id] ? `e-${id}` : undefined })}
      {errors[id] ? <p id={`e-${id}`} className="text-xs text-[var(--accent)]">{errors[id]}</p> : null}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">{form.name}</h1>
        {form.intro ? <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted-foreground)]">{form.intro}</p> : null}
      </header>

      {field("title", form.titleLabel, true, (props) => (
        <input {...props} required value={title} maxLength={200} onChange={(event) => { setTitle(event.target.value); clear("title"); }} className={fieldClass} />
      ))}
      {form.askDetails ? field("details", "Details", false, (props) => (
        <textarea {...props} value={details} maxLength={5000} rows={4} onChange={(event) => { setDetails(event.target.value); clear("details"); }} className={fieldClass} />
      )) : null}

      {form.questions.map((question) => field(question.id, question.label, question.required, (props) => {
        const value = answers[question.id] ?? "";
        const set = (next: string) => { setAnswers((old) => ({ ...old, [question.id]: next })); clear(question.id); };
        switch (question.kind) {
          case "long_text":
            return <textarea {...props} required={question.required} value={value} maxLength={3000} rows={4} onChange={(event) => set(event.target.value)} className={fieldClass} />;
          case "choice":
            return (
              <select {...props} required={question.required} value={value} onChange={(event) => set(event.target.value)} className={fieldClass}>
                <option value="">Choose…</option>
                {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            );
          case "date":
            return <input {...props} type="date" required={question.required} value={value} onChange={(event) => set(event.target.value)} className={fieldClass} />;
          case "email":
            return <input {...props} type="email" autoComplete="email" required={question.required} value={value} maxLength={300} onChange={(event) => set(event.target.value)} className={fieldClass} />;
          default:
            return <input {...props} required={question.required} value={value} maxLength={300} onChange={(event) => set(event.target.value)} className={fieldClass} />;
        }
      }))}

      {/* For bots only: people never see or fill this. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      </div>

      {failure ? <p role="alert" className="text-sm text-[var(--accent)]">{failure}</p> : null}
      <button type="submit" disabled={state === "sending"}
        className="h-11 rounded-xl bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-60">
        {state === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
