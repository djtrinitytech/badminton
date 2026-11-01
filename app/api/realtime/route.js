import { realtime, CHANNEL } from "../../../lib/realtime.mjs";
import { json, failure } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const client = realtime();
    if (!client) return json({ error: "Realtime is not configured." }, 503);
    return json(
      await client.auth.createTokenRequest({
        capability: JSON.stringify({ [CHANNEL]: ["subscribe"] }),
        ttl: 3600_000,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
