import { mutate } from "../../../lib/store.mjs";
import { requireSession, sameOrigin } from "../../../lib/auth.mjs";
import { applyAction, publicState } from "../../../lib/tournament.mjs";
import { publish } from "../../../lib/realtime.mjs";
import { json, failure, body } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    sameOrigin(request);
    const admin = requireSession(request),
      action = await body(request);
    const { state, result } = await mutate((state) =>
      applyAction(state, action, admin.sid),
    );
    const broadcast =
      action.type === "heartbeat" || result.duplicate
        ? true
        : await publish(state.revision);
    return json({ state: publicState(state, admin.sid), broadcast });
  } catch (e) {
    return failure(e);
  }
}
