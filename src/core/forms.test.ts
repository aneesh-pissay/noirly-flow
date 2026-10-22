import { describe, expect, it } from "vitest";
import { checkAnswers, describeSubmission, type FormQuestion } from "@/src/core/forms";

const q = (id: string, kind: FormQuestion["kind"], extra: Partial<FormQuestion> = {}): FormQuestion =>
  ({ id, label: id.toUpperCase(), kind, required: false, options: [], ...extra });

const form = {
  titleLabel: "What's wrong?",
  askDetails: true,
  questions: [
    q("email", "email", { required: true }),
    q("area", "choice", { options: ["Billing", "Login"] }),
    q("when", "date"),
    q("steps", "long_text"),
  ],
};

describe("checkAnswers", () => {
  it("accepts a good submission and trims it", () => {
    const result = checkAnswers(form, { title: "  Can't log in ", details: "Since Monday", answers: { email: "a@b.co", area: "Login", when: "2026-10-21", steps: "" } });
    expect(result).toMatchObject({ ok: true, title: "Can't log in", details: "Since Monday" });
    if (result.ok) expect(result.answers.map((a) => a.question.id)).toEqual(["email", "area", "when"]);
  });

  it("says what's wrong with each question", () => {
    const result = checkAnswers(form, { title: "", answers: { email: "nope", area: "Sales", when: "21/10/2026" } });
    expect(result).toEqual({ ok: false, errors: {
      title: "What's wrong? is required", email: "Enter an email address", area: "Pick one of the choices", when: "Enter a date",
    } });
    expect(checkAnswers(form, { title: "x" })).toEqual({ ok: false, errors: { email: "EMAIL is required" } });
    expect(checkAnswers(form, { title: "x".repeat(201), answers: { email: "a@b.co" } })).toMatchObject({ ok: false, errors: { title: expect.stringContaining("200") } });
  });

  it("ignores details when the form doesn't ask, and answers to unknown questions", () => {
    const result = checkAnswers({ ...form, askDetails: false }, { title: "Hi", details: "x".repeat(9000), answers: { email: "a@b.co", other: "x" } });
    expect(result).toMatchObject({ ok: true, details: "" });
  });
});

describe("describeSubmission", () => {
  it("puts details first, then answers, then the source", () => {
    expect(describeSubmission("Bugs", "It broke", [
      { question: q("email", "email"), value: "a@b.co" },
      { question: q("steps", "long_text"), value: "1. Open\n2. Click" },
    ])).toBe("It broke\n\nEMAIL: a@b.co\n\nSTEPS:\n1. Open\n2. Click\n\nSubmitted through the “Bugs” form.");
    expect(describeSubmission("Bugs", "", [])).toBe("Submitted through the “Bugs” form.");
  });
});
