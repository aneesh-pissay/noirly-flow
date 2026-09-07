import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@noirly-dev/ui";
import { BrandMark } from "@/src/components/BrandMark";
import { NoirlyLoginButton } from "@/src/features/auth/NoirlyLoginButton";

export const metadata: Metadata = {
  title: "Sign in · Noirly Flow",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/inbox";

  return (
    <AuthShell
      logo={<BrandMark className="size-14 brand-mark--on-surface md:size-16" />}
      title="Sign in to Flow"
      lead="Email, Google and verification are handled by Noirly Identity. No separate password to remember."
      footer={
        <>
          New here?{" "}
          <Link href="/" className="text-[var(--accent)] hover:underline">
            See what Flow does
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <NoirlyLoginButton redirectTo={redirectTo} />
        <p className="meta text-center">Opens Identity in a secure popup</p>
      </div>
    </AuthShell>
  );
}
