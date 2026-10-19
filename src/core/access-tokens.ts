/**
 * Personal access tokens look like `nfp_r_<secret>` (read only) or
 * `nfp_w_<secret>` (read and write). The scope letter is part of the hashed
 * token, so it can't be changed without making the token invalid; the proxy
 * reads it to turn away writes from read-only tokens before any lookup.
 */
export type TokenScope = "read" | "write";

export const TOKEN_PREFIX = "nfp_";
export const MAX_TOKENS = 20;
export const TOKEN_EXPIRY_DAYS = [30, 90, 365, 0] as const;

const PATTERN = /^nfp_([rw])_[A-Za-z0-9_-]{32,64}$/;

/** The scope a token claims, or null when it isn't one of ours. */
export function tokenScope(token: string): TokenScope | null {
  const match = PATTERN.exec(token);
  if (!match) return null;
  return match[1] === "r" ? "read" : "write";
}

export function isAccessToken(token: string) {
  return token.startsWith(TOKEN_PREFIX);
}

/** What the token list shows: enough to recognise a token, never enough to use it. */
export function tokenHint(token: string) {
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

/** A read-only token may only read. */
export function scopeAllows(scope: TokenScope, method: string) {
  return scope === "write" || ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export type AccessTokenView = {
  id: string;
  name: string;
  scope: TokenScope;
  hint: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};
