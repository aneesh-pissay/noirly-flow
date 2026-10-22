import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicForm } from "@/src/server/forms";
import { PublicFormView } from "@/src/features/forms/PublicFormView";

type Params = { params: Promise<{ publicId: string }> };

// Shared by link only; keep it out of search results.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const form = await getPublicForm((await params).publicId);
  return { title: form ? `${form.name} · Noirly Flow` : "Form not found · Noirly Flow", robots: { index: false, follow: false } };
}

export default async function PublicFormPage({ params }: Params) {
  const { publicId } = await params;
  const form = await getPublicForm(publicId);
  if (!form) notFound();
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-6 px-4 py-12">
      <PublicFormView publicId={publicId} form={form} />
      <p className="text-center text-xs text-[var(--muted-foreground)]">Powered by Noirly Flow</p>
    </main>
  );
}
