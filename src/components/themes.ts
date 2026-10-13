import { NOIRLY_THEMES } from "@noirly-dev/ui";

/**
 * Palettes the shared UI package ships that Flow doesn't offer. Removed here
 * rather than in @noirly-dev/ui, which the other Noirly apps also use.
 */
export const REMOVED_THEME_IDS = ["forest"] as const;

export const FLOW_THEMES = NOIRLY_THEMES.filter(
  (theme) => !(REMOVED_THEME_IDS as readonly string[]).includes(theme.id),
);

export function isFlowThemeId(id: string): boolean {
  return FLOW_THEMES.some((theme) => theme.id === id);
}
