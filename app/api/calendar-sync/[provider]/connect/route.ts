import { NextResponse } from "next/server";
import { ApiError, getSyncProvider, jsonError, refuseAccessToken } from "@/src/server/api/http";
import { isProvider, startConnect } from "@/src/server/calendar-sync/service";

type Params = { params: Promise<{ provider: string }> };

/** Sends the browser to Google or Microsoft to allow access to a Flow calendar. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isProvider(provider)) throw new ApiError(404, "not_found", "Unknown calendar");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Connecting a calendar");
    const { url, cookie } = startConnect(provider);
    const response = NextResponse.redirect(url);
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: cookie.maxAge, path: `/api/calendar-sync/${provider}`,
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
