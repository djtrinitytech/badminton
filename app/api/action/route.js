import { mutate, realtimeConfigured } from "../../../lib/store.mjs";
import { requireSession, sameOrigin } from "../../../lib/auth.mjs";
import { applyAction, publicState } from "../../../lib/tournament.mjs";
import { json, failure, body } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    sameOrigin(request);
    const admin = requireSession(request),
      action = await body(request);
    const { state } = await mutate((state) =>
      applyAction(state, action, admin.sid),
    );
    // The SQL commit updates the public revision notification in the same transaction.
    return json({
      state: publicState(state, admin.sid),
      broadcast: realtimeConfigured(),
    });
  } catch (e) {
    return failure(e);
  }
}
