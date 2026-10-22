import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSyncProvider } from "@/src/server/api/http";
import { OAUTH_COOKIE, finishConnect, isProvider } from "@/src/server/calendar-sync/service";

type Params = { params: Promise<{ provider: string }> };

/** Where Google or Microsoft send the browser back. Always ends on Settings, with how it went. */
export async function GET(request: Request, { params }: Params) {
  const { provider } = await params;
  const url = new URL(request.url);
  const back = (result: string) => {
    const target = new URL("/settings", url.origin);
    target.searchParams.set("calendar", result);
    target.hash = "calendar-sync";
    const response = NextResponse.redirect(target);
    if (isProvider(provider)) response.cookies.delete({ name: OAUTH_COOKIE, path: `/api/calendar-sync/${provider}` });
    return response;
  };
  if (!isProvider(provider)) return back("error");
  if (url.searchParams.get("error")) return back("cancelled");
  try {
    const { ctx } = await getSyncProvider();
    await finishConnect(ctx.userId, provider, {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      cookie: (await cookies()).get(OAUTH_COOKIE)?.value,
    });
    return back(`${provider}-connected`);
  } catch {
    console.error("Calendar connect failed");
    return back("error");
  }
}
