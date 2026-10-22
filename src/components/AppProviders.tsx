"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { DEFAULT_THEME_ID } from "@noirly-dev/ui";
import { FaviconTheme } from "@/src/components/FaviconTheme";
import { ThemeProvider } from "@/src/components/ThemeProvider";
import { FlowRealtimeProvider } from "@/src/features/realtime/FlowRealtimeProvider";
import { SavingIndicator } from "@/src/components/SavingIndicator";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { ApiRequestError } from "@/src/lib/api-client";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            // A 4xx (forbidden, not found, invalid) will not change on retry;
            // only retry network and server errors.
            retry: (failureCount, error) =>
              !(error instanceof ApiRequestError && error.status < 500) && failureCount < 3,
            // Ask even when the browser says it's offline: the service worker
            // answers reads from what it saved.
            networkMode: "offlineFirst",
          },
          // Writes aren't held for later; offline they fail at once and say why.
          mutations: { networkMode: "always" },
        },
      }),
  );

  return (
    <ThemeProvider defaultThemeId={DEFAULT_THEME_ID}>
      <FaviconTheme />
      <QueryClientProvider client={client}>
        <FlowRealtimeProvider>
          <div className="flex min-h-dvh flex-1 flex-col">
            <OfflineBanner />
            {children}
          </div>
          <SavingIndicator />
        </FlowRealtimeProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
