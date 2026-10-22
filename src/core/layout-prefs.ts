export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export const CONTENT_WIDTHS = ["standard", "wide"] as const;
export type ContentWidth = (typeof CONTENT_WIDTHS)[number];

export type LayoutPrefs = { density: Density; contentWidth: ContentWidth };

export const DEFAULT_LAYOUT: LayoutPrefs = { density: "comfortable", contentWidth: "standard" };

/** Where the browser keeps a copy, so the page is laid out right before the profile loads. */
export const LAYOUT_STORAGE_KEY = "flow.layout";

/** Anything stored or sent, read back as valid preferences. */
export function readLayout(value: unknown): LayoutPrefs {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    density: DENSITIES.includes(raw.density as Density) ? (raw.density as Density) : DEFAULT_LAYOUT.density,
    contentWidth: CONTENT_WIDTHS.includes(raw.contentWidth as ContentWidth) ? (raw.contentWidth as ContentWidth) : DEFAULT_LAYOUT.contentWidth,
  };
}

/**
 * Runs in <head> before the page paints: copies the saved choice onto
 * <html data-density data-width>. Kept tiny and self-contained (it's inlined).
 */
export const LAYOUT_BOOT_SCRIPT = `try{var l=JSON.parse(localStorage.getItem(${JSON.stringify(LAYOUT_STORAGE_KEY)})||"{}"),d=document.documentElement;if(l.density==="compact")d.dataset.density="compact";if(l.contentWidth==="wide")d.dataset.width="wide"}catch(e){}`;
