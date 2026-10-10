import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@noirly-dev/ui";
import { auth } from "@/auth";
import { BrandMark } from "@/src/components/BrandMark";
import { MarketingHeader } from "@/src/components/MarketingHeader";
import { NoirlyLoginButton } from "@/src/features/auth/NoirlyLoginButton";

export const metadata: Metadata = {
  title: "Noirly Flow",
  description:
    "Task boards, workspaces, and realtime collaboration for the Noirly ecosystem.",
};

const features = [
  {
    title: "Boards",
    copy: "Projects as columns and cards you can reorder live.",
  },
  {
    title: "Workspaces",
    copy: "Teams, members, and invites under one roof.",
  },
  {
    title: "Inbox",
    copy: "Mentions, assignments, and activity in one feed.",
  },
  {
    title: "Realtime",
    copy: "Updates land as they happen across the board.",
  },
  {
    title: "Noirly Identity",
    copy: "Sign in once with email or Google. No new password to remember.",
  },
  {
    title: "Settings",
    copy: "Flow profile stays here; your account lives in Identity.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    // Proxy also redirects signed-in `/` → `/inbox`; this is the RSC fallback.
    redirect("/inbox");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <MarketingHeader />

      <main id="main" className="flex flex-1 flex-col">
        <section className="shell section-y">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <BrandMark className="size-[4.25rem] md:size-20" />
            <p className="eyebrow mt-7">Tasks &amp; projects</p>
            <h1 className="display-lg mt-4 text-balance">
              Boards that move as fast as the team.
            </h1>
            <p className="lede mt-5 text-center">
              Workspaces, boards, and realtime updates in one Flow — for you alone
              or for the whole team.
            </p>

            <div className="mt-9 w-full max-w-xs">
              <NoirlyLoginButton redirectTo="/inbox" />
            </div>
            <p className="meta mt-4">Opens Noirly Identity in a secure popup</p>
          </div>
        </section>

        <section className="section-rule relative">
          <div className="shell section-y">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow justify-center">What is inside</p>
              <h2 className="display-md mt-4">Built for how work actually moves</h2>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {features.map((item) => (
                <Card key={item.title} variant="interactive">
                  <CardHeader>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="copy">{item.copy}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="section-rule relative">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-7">
          <span className="flex items-center gap-4 text-[var(--text)]">
            <span className="inline-flex size-[4.25rem] shrink-0 md:size-20">
              <BrandMark className="size-full" />
            </span>
            <span className="display-md">Noirly Flow</span>
          </span>
          <span className="flex flex-wrap items-center gap-4">
            <span className="meta">Boards · Workspaces · Inbox · Realtime</span>
            <Link href="/privacy" className="meta underline-offset-4 hover:text-[var(--text)] hover:underline">
              Privacy policy
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
