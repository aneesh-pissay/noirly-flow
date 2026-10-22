import type { TaskPriority } from "@/src/core/models/enums";

export const QUESTION_KINDS = ["short_text", "long_text", "email", "choice", "date"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  short_text: "Short answer", long_text: "Paragraph", email: "Email", choice: "Choice", date: "Date",
};

export type FormQuestion = {
  id: string;
  label: string;
  kind: QuestionKind;
  required: boolean;
  /** Choices for a choice question. */
  options: string[];
};

/** What a project member edits. */
export type IntakeForm = {
  id: string;
  projectId: string;
  publicId: string;
  name: string;
  intro: string | null;
  /** The question whose answer becomes the task title. */
  titleLabel: string;
  /** Show a "details" box whose answer opens the task description. */
  askDetails: boolean;
  questions: FormQuestion[];
  defaults: { priority: TaskPriority; sectionId: string | null; tagIds: string[]; assigneeId: string | null };
  confirmation: string | null;
  enabled: boolean;
  submissionCount: number;
  lastSubmittedAt: string | null;
};

/** What anyone with the link sees: no ids beyond the questions'. */
export type PublicForm = Pick<IntakeForm, "name" | "intro" | "titleLabel" | "askDetails" | "questions" | "confirmation">;

export type FormAnswers = { title?: unknown; details?: unknown; answers?: Record<string, unknown> };

export const MAX_QUESTIONS = 15;
export const MAX_OPTIONS = 20;
export const LIMITS = { title: 200, details: 5000, short: 300, long: 3000 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Checks a submission against the form. Returns the cleaned answers, or an
 * error message per question (`title` and `details` for the built-in ones).
 */
export function checkAnswers(form: Pick<PublicForm, "titleLabel" | "askDetails" | "questions">, input: FormAnswers):
  { ok: true; title: string; details: string; answers: Array<{ question: FormQuestion; value: string }> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = text(input.title);
  if (!title) errors.title = `${form.titleLabel} is required`;
  else if (title.length > LIMITS.title) errors.title = `Keep it under ${LIMITS.title} characters`;
  const details = form.askDetails ? text(input.details) : "";
  if (details.length > LIMITS.details) errors.details = `Keep it under ${LIMITS.details} characters`;

  const raw = input.answers && typeof input.answers === "object" ? input.answers : {};
  const answers: Array<{ question: FormQuestion; value: string }> = [];
  for (const question of form.questions) {
    const value = text(raw[question.id]);
    if (!value) {
      if (question.required) errors[question.id] = `${question.label} is required`;
      continue;
    }
    const max = question.kind === "long_text" ? LIMITS.long : LIMITS.short;
    if (value.length > max) errors[question.id] = `Keep it under ${max} characters`;
    else if (question.kind === "email" && !EMAIL.test(value)) errors[question.id] = "Enter an email address";
    else if (question.kind === "choice" && !question.options.includes(value)) errors[question.id] = "Pick one of the choices";
    else if (question.kind === "date" && (!DAY.test(value) || Number.isNaN(Date.parse(value)))) errors[question.id] = "Enter a date";
    else answers.push({ question, value });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, title, details, answers };
}

/** The task description: the details, then each answer on its own line, then where it came from. */
export function describeSubmission(formName: string, details: string, answers: Array<{ question: FormQuestion; value: string }>) {
  const lines = answers.map(({ question, value }) => (question.kind === "long_text" ? `${question.label}:\n${value}` : `${question.label}: ${value}`));
  return [details, lines.join("\n\n"), `Submitted through the “${formName}” form.`].filter(Boolean).join("\n\n");
}
