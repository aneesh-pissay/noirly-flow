"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { LAYOUT_STORAGE_KEY, readLayout } from "@/src/core/layout-prefs";

/**
 * Puts the profile's density and width on <html> (where globals.css reads
 * them), and keeps a local copy so the next visit is laid out before it loads.
 */
export function LayoutPreferences() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 60_000 });
  const profile = me.data?.user.profile;
  useEffect(() => {
    if (!profile) return;
    const layout = readLayout(profile);
    const root = document.documentElement;
    if (layout.density === "compact") root.dataset.density = "compact";
    else delete root.dataset.density;
    if (layout.contentWidth === "wide") root.dataset.width = "wide";
    else delete root.dataset.width;
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Storage blocked: the profile still applies once it loads.
    }
  }, [profile]);
  return null;
}
