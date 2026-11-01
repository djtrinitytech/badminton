import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { initialState, RuleError } from "./tournament.mjs";
import { createSupabaseStore } from "./supabase-store.mjs";

const production =
  process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
const local = process.env.LOCAL_DEMO === "true" && !production;
const filepath = path.join(process.cwd(), ".data", "tournament.json");
export function mode() {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? "supabase"
    : local
      ? "local"
      : "unconfigured";
}
export function realtimeConfigured() {
  return mode() === "supabase" && !!process.env.SUPABASE_PUBLISHABLE_KEY;
}
function backend() {
  if (mode() !== "supabase")
    throw new RuleError(
      "Set SUPABASE_URL and SUPABASE_SECRET_KEY, then run supabase/setup.sql in the Supabase SQL Editor.",
      503,
    );
  if (!globalThis.__vyuhaSupabaseStore) {
    const client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    globalThis.__vyuhaSupabaseStore = createSupabaseStore(client);
  }
  return globalThis.__vyuhaSupabaseStore;
}
async function initializeLocal() {
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  try {
    await fs.writeFile(filepath, JSON.stringify(initialState()), {
      flag: "wx",
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}
export async function readState() {
  if (mode() !== "local") return backend().readState();
  await initializeLocal();
  return JSON.parse(await fs.readFile(filepath, "utf8"));
}
export async function mutate(fn) {
  if (mode() !== "local") return backend().mutate(fn);
  const previous = globalThis.__vyuhaQueue || Promise.resolve();
  let release;
  globalThis.__vyuhaQueue = new Promise((r) => (release = r));
  await previous;
  try {
    const state = await readState(),
      result = await fn(state);
    await fs.writeFile(filepath + ".tmp", JSON.stringify(state));
    await fs.rename(filepath + ".tmp", filepath);
    return { state, result };
  } finally {
    release();
  }
}
export async function loginAttempt(key) {
  if (mode() !== "local") return backend().loginAttempt(key);
  globalThis.__loginLimits ||= new Map();
  const now = Date.now(),
    old = globalThis.__loginLimits.get(key),
    item =
      old && old.reset > now
        ? { ...old, n: old.n + 1 }
        : { n: 1, reset: now + 15 * 60_000 };
  globalThis.__loginLimits.set(key, item);
  return item.n <= 10;
}
