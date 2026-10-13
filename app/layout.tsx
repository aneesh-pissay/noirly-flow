import { headers } from "next/headers";
import type { Metadata } from "next";
import { NoirlyHead, PALETTE_STORAGE_KEY, noirlyFontClassName } from "@noirly-dev/ui";
import { REMOVED_THEME_IDS } from "@/src/components/themes";
import { NoirlyExperience } from "@noirly-dev/ui/experience";
import { AppProviders } from "@/src/components/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noirly Flow",
  description: "Task and project management for the Noirly ecosystem",
  icons: {
    icon: [
      {
        url: "/brand-mark-light.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/brand-mark-dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className="dark h-full"
      data-theme="gold"
      suppressHydrationWarning
    >
      <head>
        {/* Runs before NoirlyHead's boot script: a saved palette Flow no longer
            offers is cleared, so it falls back to gold without a flash. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var k=${JSON.stringify(PALETTE_STORAGE_KEY)};if(${JSON.stringify(REMOVED_THEME_IDS)}.indexOf(localStorage.getItem(k))!==-1)localStorage.removeItem(k)}catch(e){}`,
          }}
        />
        <NoirlyHead themeId="gold" nonce={nonce} />
      </head>
      <body className={`${noirlyFontClassName} flex min-h-dvh flex-col antialiased`}>
        <NoirlyExperience mark="Noirly Flow" pageTransition={false} cursor={false}>
          <AppProviders>{children}</AppProviders>
        </NoirlyExperience>
      </body>
    </html>
  );
}
