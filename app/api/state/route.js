import { readState, mode } from "../../../lib/store.mjs";
import { session } from "../../../lib/auth.mjs";
import { publicState } from "../../../lib/tournament.mjs";
import { json, failure } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const admin = session(request),
      state = await readState();
    return json({
      state: publicState(state, admin?.sid),
      admin: !!admin,
      storage: mode(),
      realtime: !!process.env.ABLY_API_KEY,
    });
  } catch (e) {
    return failure(e);
  }
}
