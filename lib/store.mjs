import { Pool } from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { initialState, RuleError } from "./tournament.mjs";

const production =
  process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
const local = process.env.LOCAL_DEMO === "true" && !production;
const globals = globalThis;
const filepath = path.join(process.cwd(), ".data", "tournament.json");
export function mode() {
  return process.env.DATABASE_URL
    ? "postgres"
    : local
      ? "local"
      : "unconfigured";
}
function pool() {
  if (!process.env.DATABASE_URL)
    throw new RuleError(
      "Database is not configured. Set DATABASE_URL on the server.",
      503,
    );
  globals.__vyuhaPool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  });
  return globals.__vyuhaPool;
}
export async function initialize() {
  if (local && !process.env.DATABASE_URL) {
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    try {
      await fs.writeFile(filepath, JSON.stringify(initialState()), {
        flag: "wx",
      });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    return;
  }
  if (!globals.__vyuhaInit)
    globals.__vyuhaInit = (async () => {
      const db = await pool().connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT pg_advisory_xact_lock(20261102)");
        await db.query(
          "CREATE TABLE IF NOT EXISTS vyuha_state (id integer PRIMARY KEY, data jsonb NOT NULL)",
        );
        await db.query(
          "CREATE TABLE IF NOT EXISTS vyuha_auth_attempts (key text PRIMARY KEY, attempts integer NOT NULL, reset_at bigint NOT NULL)",
        );
        await db.query(
          "INSERT INTO vyuha_state (id,data) VALUES (1,$1) ON CONFLICT DO NOTHING",
          [JSON.stringify(initialState())],
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
    })().catch((e) => {
      globals.__vyuhaInit = null;
      throw e;
    });
  await globals.__vyuhaInit;
}
export async function readState() {
  await initialize();
  if (local && !process.env.DATABASE_URL)
    return JSON.parse(await fs.readFile(filepath, "utf8"));
  return (await pool().query("SELECT data FROM vyuha_state WHERE id=1")).rows[0]
    .data;
}
export async function mutate(fn) {
  await initialize();
  if (local && !process.env.DATABASE_URL) {
    const previous = globals.__vyuhaQueue || Promise.resolve();
    let release;
    globals.__vyuhaQueue = new Promise((r) => (release = r));
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
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const state = (
      await client.query("SELECT data FROM vyuha_state WHERE id=1 FOR UPDATE")
    ).rows[0].data;
    const result = await fn(state);
    await client.query("UPDATE vyuha_state SET data=$1 WHERE id=1", [
      JSON.stringify(state),
    ]);
    await client.query("COMMIT");
    return { state, result };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function loginAttempt(key) {
  const now = Date.now(),
    reset = now + 15 * 60_000;
  await initialize();
  if (local && !process.env.DATABASE_URL) {
    globals.__loginLimits ||= new Map();
    const old = globals.__loginLimits.get(key);
    const item =
      old && old.reset > now ? { ...old, n: old.n + 1 } : { n: 1, reset };
    globals.__loginLimits.set(key, item);
    return item.n <= 10;
  }
  const r = await pool().query(
    "INSERT INTO vyuha_auth_attempts (key,attempts,reset_at) VALUES ($1,1,$2) ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN vyuha_auth_attempts.reset_at<$3 THEN 1 ELSE vyuha_auth_attempts.attempts+1 END, reset_at=CASE WHEN vyuha_auth_attempts.reset_at<$3 THEN $2 ELSE vyuha_auth_attempts.reset_at END RETURNING attempts",
    [key, reset, now],
  );
  return r.rows[0].attempts <= 10;
}
