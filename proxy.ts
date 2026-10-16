import { safeLocalPath } from "@/src/lib/safe-path";
import { consumeRateLimit } from "@/src/server/security/rate-limit";
import { securePageResponse, rejectCrossOriginMutation } from "@/src/server/security/request";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const proxy = auth(async (request) => {
  if (request.nextUrl.pathname.endsWith(".map")) return new NextResponse(null, { status: 404 });
  const api = request.nextUrl.pathname.startsWith("/api/");
  const authApi = request.nextUrl.pathname.startsWith("/api/auth/");
  const webhook =
    request.nextUrl.pathname === "/api/identity/account-deleted" ||
    request.nextUrl.pathname === "/api/identity/space-changed";
  if (api && !authApi && !webhook) {
    const bearer = /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "");
    if (!bearer) {
      const rejection = rejectCrossOriginMutation(request, process.env.AUTH_URL);
      if (rejection) return rejection;
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("x-noirly-csrf") !== "1") {
        return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
      }
    }
    try {
      const ip = request.headers.get(process.env.TRUSTED_CLIENT_IP_HEADER ?? "x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
      const result = await consumeRateLimit(`flow-api:${ip}`, 300, 60);
      if (!result.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
    } catch { return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 }); }
  }
  const { pathname } = request.nextUrl;
  const isLanding = pathname === "/";
  // Readable without an account, signed in or not (Google Play links to the privacy policy).
  const isPublicPage = pathname === "/privacy";
  const isLogin = pathname === "/login";
  const isLoginPopup =
    pathname === "/login/popup" || pathname === "/login/popup-complete";
  const isAuthApi = pathname.startsWith("/api/auth");
  // API routes authenticate themselves (cookie or Bearer). Do not redirect mobile clients.
  const isApi = pathname.startsWith("/api/");

  if (
    !request.auth &&
    !isLanding &&
    !isPublicPage &&
    !isLogin &&
    !isLoginPopup &&
    !isAuthApi &&
    !isApi
  ) {
    const login = new URL("/login", request.nextUrl.origin);
    if (pathname.startsWith("/invite/")) {
      login.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(login);
  }

  if (request.auth && isLogin) {
    const next = request.nextUrl.searchParams.get("next");
    const safeNext = safeLocalPath(next, "");
    if (safeNext) {
      return NextResponse.redirect(new URL(safeNext, request.nextUrl.origin));
    }
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  if (request.auth && isLanding) {
    return NextResponse.redirect(new URL("/inbox", request.nextUrl.origin));
  }

  return securePageResponse(request);
});

export const config = {
  matcher: [
    "/api/:path*",
    "/_next/:path*.map",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
