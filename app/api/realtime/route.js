import { realtimeConfigured } from "../../../lib/store.mjs";
import { json } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  if (!realtimeConfigured())
    return json({ error: "Supabase Realtime is not configured." }, 503);
  // Never return the backend secret key.
  return json({
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  });
}
