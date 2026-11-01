import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSupabaseStore } from "../lib/supabase-store.mjs";
import { initialState, applyAction } from "../lib/tournament.mjs";

const db = new PGlite();
const setup = await fs.readFile(
  new URL("../supabase/setup.sql", import.meta.url),
  "utf8",
);
await db.exec(
  "create role anon; create role authenticated; create role service_role bypassrls;",
);
await db.exec(setup);
// Adapter exercises the exact Supabase RPC argument contract against real PostgreSQL SQL.
const client = {
  from(table) {
    assert.equal(table, "vyuha_state");
    return {
      select() {
        return {
          eq(column, id) {
            assert.equal(column, "id");
            assert.equal(id, 1);
            return {
              async maybeSingle() {
                const r = await db.query(
                  "select data, storage_version from public.vyuha_state where id=1",
                );
                return { data: r.rows[0] || null, error: null };
              },
            };
          },
        };
      },
    };
  },
  async rpc(name, args) {
    try {
      let query, values;
      if (name === "vyuha_initialize") {
        query = "select public.vyuha_initialize($1::jsonb) as value";
        values = [JSON.stringify(args.p_seed)];
      } else if (name === "vyuha_commit") {
        query = "select public.vyuha_commit($1::bigint,$2::jsonb) as value";
        values = [args.p_expected_version, JSON.stringify(args.p_next)];
      } else if (name === "vyuha_login_attempt") {
        query = "select public.vyuha_login_attempt($1) as value";
        values = [args.p_key];
      } else throw new Error("Unexpected RPC");
      return {
        data: (await db.query(query, values)).rows[0].value,
        error: null,
      };
    } catch (error) {
      return { data: null, error };
    }
  },
};
const store = createSupabaseStore(client);
const action = (owner, payload) =>
  store.mutate((s) =>
    applyAction(s, { opId: crypto.randomUUID(), ...payload }, owner),
  );

test("Supabase SQL initializes safely, seeds via API, and can be rerun", async () => {
  await db.exec("set role service_role");
  const state = await store.readState();
  assert.equal(state.matches.length, 78);
  await db.exec("reset role");
  await db.exec(setup);
  await db.exec("set role service_role");
  assert.equal((await store.readState()).matches.length, 78);
});
test("Supabase API compare-and-swap allows only one device to start a match", async () => {
  const results = await Promise.allSettled([
    action("phone-a", { type: "start", matchId: "MD-A3" }),
    action("phone-b", { type: "start", matchId: "MD-A3" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const saved = await store.readState();
  assert.ok(["phone-a", "phone-b"].includes(saved.matches[0].lock.owner));
});
test("Supabase score commit notifies atomically; heartbeat CAS cannot overwrite a point", async () => {
  let state = await store.readState(),
    m = state.matches[0],
    owner = m.lock.owner;
  const results = await Promise.all([
    action(owner, { type: "heartbeat", matchId: m.id }),
    action(owner, {
      type: "score",
      matchId: m.id,
      side: "a",
      delta: 1,
      version: m.version,
    }),
  ]);
  state = await store.readState();
  assert.equal(state.matches[0].scoreA, 1);
  const revision = (
    await db.query("select revision from public.vyuha_updates where id=1")
  ).rows[0].revision;
  assert.equal(Number(revision), state.revision);
  const row = (
    await db.query("select storage_version from public.vyuha_state where id=1")
  ).rows[0];
  assert.equal(Number(row.storage_version), 3);
  assert.equal(state.revision, 2);
  const heartbeat = await action(owner, { type: "heartbeat", matchId: m.id });
  assert.equal(heartbeat.state.revision, 2);
  assert.equal(
    Number(
      (await db.query("select revision from public.vyuha_updates where id=1"))
        .rows[0].revision,
    ),
    2,
  );
});
test("Supabase duplicate retries do not add points or write twice", async () => {
  const s = await store.readState(),
    m = s.matches[0],
    a = {
      type: "score",
      opId: crypto.randomUUID(),
      matchId: m.id,
      side: "a",
      delta: 1,
      version: m.version,
    };
  await store.mutate((s) => applyAction(s, a, m.lock.owner));
  const version = (
    await db.query("select storage_version from public.vyuha_state where id=1")
  ).rows[0].storage_version;
  const retry = await store.mutate((s) => applyAction(s, a, m.lock.owner));
  assert.equal(retry.result.duplicate, true);
  assert.equal(retry.state.matches[0].scoreA, 2);
  assert.equal(
    (
      await db.query(
        "select storage_version from public.vyuha_state where id=1",
      )
    ).rows[0].storage_version,
    version,
  );
});
test("Supabase login attempt limits persist across API client instances", async () => {
  for (let n = 0; n < 10; n++)
    assert.equal(await store.loginAttempt("test-ip"), true);
  assert.equal(
    await createSupabaseStore(client).loginAttempt("test-ip"),
    false,
  );
});
test("public Supabase key can read only revisions, not scores, login records or mutation RPCs", async () => {
  await db.exec("reset role; set role anon;");
  assert.ok(
    (await db.query("select revision from public.vyuha_updates")).rows.length,
  );
  await assert.rejects(
    () => db.query("select * from public.vyuha_state"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select * from public.vyuha_auth_attempts"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query("select public.vyuha_commit(0,$1::jsonb)", [
        JSON.stringify(initialState()),
      ]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query("select public.vyuha_initialize($1::jsonb)", [
        JSON.stringify(initialState()),
      ]),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select public.vyuha_login_attempt('bypass')"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("update public.vyuha_updates set revision=99"),
    /permission denied/,
  );
  await db.exec("reset role;");
});
test.after(async () => {
  await db.close();
});
