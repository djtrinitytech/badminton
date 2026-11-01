// Run against a fresh, explicitly disposable LOCAL_DEMO preview, never production.
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Smoke tests may only target localhost.");
const password = process.env.TEST_ADMIN_PASSWORD;
if (!password)
  throw Error("Set TEST_ADMIN_PASSWORD to the local preview password.");
let n = 0;
async function req(
  path,
  { cookie, body, method = body ? "POST" : "GET", origin = base } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const publicData = await req("/api/state");
assert.equal(publicData.status, 200);
assert.equal(
  publicData.data.storage,
  "local",
  "Only run against a disposable local store.",
);
assert.equal(publicData.data.admin, false);
const invalid = await req("/api/action", {
  body: { type: "draw", category: "MS", opId: crypto.randomUUID() },
});
assert.equal(invalid.status, 401);
assert.equal(
  (
    await req("/api/auth", {
      body: { password },
      origin: "https://wrong.example",
    })
  ).status,
  403,
);
const a = await req("/api/auth", { body: { password } }),
  b = await req("/api/auth", { body: { password } });
assert.equal(a.status, 200);
assert.equal(b.status, 200);
assert.notEqual(a.cookie, b.cookie);
assert.match(a.cookie, /vyuha_admin=/);
const m = publicData.data.state.matches.find((m) => m.id === "MS-A6");
assert.equal(m.status, "scheduled", "Test fixture must be fresh.");
const action = (cookie, payload) =>
  req("/api/action", {
    cookie,
    body: { opId: `http-smoke-${Date.now()}-${++n}`, ...payload },
  });
const concurrent = await Promise.all([
  action(a.cookie, { type: "start", matchId: m.id }),
  action(b.cookie, { type: "start", matchId: m.id }),
]);
assert.equal(concurrent.filter((r) => r.status === 200).length, 1);
assert.equal(concurrent.filter((r) => r.status === 409).length, 1);
const winner = concurrent[0].status === 200 ? a.cookie : b.cookie,
  loser = winner === a.cookie ? b.cookie : a.cookie;
let state = concurrent.find((r) => r.status === 200).data.state;
assert.equal(state.matches.find((x) => x.id === m.id).lock.mine, true);
let pub = (await req("/api/state")).data.state;
assert.equal(pub.matches.find((x) => x.id === m.id).lock.mine, false);
assert.equal(pub.matches.find((x) => x.id === m.id).lock.owner, undefined);
assert.equal(
  (
    await action(loser, {
      type: "score",
      matchId: m.id,
      side: "a",
      delta: 1,
      version: 1,
    })
  ).status,
  409,
);
const payload = {
  type: "score",
  matchId: m.id,
  side: "a",
  delta: 1,
  version: state.matches.find((x) => x.id === m.id).version,
  opId: crypto.randomUUID(),
};
let response = await action(winner, payload);
assert.equal(response.status, 200);
const duplicate = await action(winner, payload);
assert.equal(duplicate.status, 200);
assert.equal(duplicate.data.state.matches.find((x) => x.id === m.id).scoreA, 1);
state = response.data.state;
for (let i = 1; i < 15; i++) {
  response = await action(winner, {
    type: "score",
    matchId: m.id,
    side: "a",
    delta: 1,
    version: state.matches.find((x) => x.id === m.id).version,
  });
  assert.equal(response.status, 200);
  state = response.data.state;
}
assert.equal(
  (await action(winner, { type: "finish", matchId: m.id })).status,
  200,
);
pub = (await req("/api/state")).data.state;
assert.equal(pub.matches.find((x) => x.id === m.id).scoreA, 15);
assert.equal(pub.matches.find((x) => x.id === m.id).status, "finished");
assert.equal((await req("/api/audit")).status, 401);
assert.ok(
  (await req("/api/audit", { cookie: winner })).data.audit.length >= 17,
);
await action(winner, { type: "reopen", matchId: m.id });
console.log(
  "API smoke passed: public access, origin protection, password sessions, competing devices, atomic updates, idempotent retry, finish, standings persistence, and private audit.",
);
