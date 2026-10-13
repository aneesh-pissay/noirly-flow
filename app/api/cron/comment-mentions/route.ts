import { timingSafeEqual } from "node:crypto";
import { deliverCommentMentions } from "@/src/server/mail/comment-mentions";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "not_configured" }, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try { return Response.json(await deliverCommentMentions()); }
  catch { return Response.json({ error: "delivery_unavailable" }, { status: 503 }); }
}
