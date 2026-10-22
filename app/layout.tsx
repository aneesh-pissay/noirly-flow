import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import { NoirlyHead, PALETTE_STORAGE_KEY, noirlyFontClassName } from "@noirly-dev/ui";
import { REMOVED_THEME_IDS } from "@/src/components/themes";
import { NoirlyExperience } from "@noirly-dev/ui/experience";
import { AppProviders } from "@/src/components/AppProviders";
import { LAYOUT_BOOT_SCRIPT } from "@/src/core/layout-prefs";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#0B0B0C" };

export const metadata: Metadata = {
  title: "Noirly Flow",
  appleWebApp: { capable: true, title: "Flow", statusBarStyle: "black-translucent" },
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
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
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
        {/* Density and width from the last visit, before first paint. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LAYOUT_BOOT_SCRIPT }} />
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
