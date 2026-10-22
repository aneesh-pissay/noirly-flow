import { readApiJson } from "@/src/server/security/body";
import { ApiError, jsonError, jsonOk, providerFor } from "@/src/server/api/http";
import { submitFormBodySchema } from "@/src/server/api/schemas";
import { submitForm } from "@/src/server/forms";

type Params = { params: Promise<{ publicId: string }> };

/** A response to a public form. No account needed; limited per address and per form. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { publicId } = await params;
    const body = submitFormBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid response");
    const ip = request.headers.get(process.env.TRUSTED_CLIENT_IP_HEADER ?? "x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
    const result = await submitForm(publicId, body.data, ip, providerFor);
    // Don't hand the task id to the public.
    return result.ok ? jsonOk({ ok: true }, 201) : jsonOk({ ok: false, errors: result.errors }, 422);
  } catch (error) {
    return jsonError(error);
  }
}
