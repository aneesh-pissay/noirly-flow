import { readApiJson } from "@/src/server/security/body";
import { ApiError, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createAccessTokenBodySchema } from "@/src/server/api/schemas";
import { createAccessToken, listAccessTokens } from "@/src/server/access-tokens";

/** Tokens are managed from a signed-in browser only, so a leaked token can't mint more. */
async function sessionUser() {
  const { ctx } = await getSyncProvider();
  if (ctx.via !== "session") throw new ApiError(403, "forbidden", "Manage tokens from Settings while signed in");
  return ctx.userId;
}

export async function GET() {
  try {
    return jsonOk({ tokens: await listAccessTokens(await sessionUser()) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Returns the secret once; it isn't stored. */
export async function POST(request: Request) {
  try {
    const userId = await sessionUser();
    const body = createAccessTokenBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid token");
    return jsonOk(await createAccessToken(userId, body.data), 201);
  } catch (error) {
    return jsonError(error);
  }
}
