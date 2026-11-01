import { readState } from "../../../lib/store.mjs";
import { requireSession } from "../../../lib/auth.mjs";
import { json, failure } from "../../../lib/http.mjs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    requireSession(request);
    return json({ audit: (await readState()).audit });
  } catch (e) {
    return failure(e);
  }
}
