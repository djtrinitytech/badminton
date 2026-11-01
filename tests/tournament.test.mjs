import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  applyAction,
  scoreWinner,
  validProgress,
  standings,
  publicState,
  seedPositions,
  LEASE_MS,
} from "../lib/tournament.mjs";
let seq = 0;
const op = (s, a, owner = "device-1", now = 1000) =>
  applyAction(s, { opId: `operation-${++seq}`, ...a }, owner, now);
test("exact PDF import and replacement pair; every league entrant has two games", () => {
  const s = initialState();
  assert.equal(s.entrants.length, 78);
  assert.equal(s.matches.length, 78);
  assert.deepEqual(s.entrants.find((e) => e.id === "MD-A-2").players, [
    "Rian Bangera",
    "Aryan Bhandari",
  ]);
  assert.deepEqual(s.entrants.find((e) => e.id === "MD-A-1").players, [
    "Haardik Patil",
    "Vansh Patel",
  ]);
  for (const e of s.entrants)
    assert.equal(
      s.matches.filter((m) => [m.a, m.b].includes(e.id)).length,
      2,
      e.id,
    );
});
test("all reachable scores obey target, win-by-two, and hard cap", () => {
  for (const [a, b, w] of [
    [15, 0, "a"],
    [15, 13, "a"],
    [15, 14, null],
    [16, 14, "a"],
    [17, 15, "a"],
    [17, 16, null],
    [17, 17, null],
    [18, 16, "a"],
    [18, 17, "a"],
    [18, 18, null],
    [18, 15, null],
    [16, 13, null],
    [14, 16, "b"],
    [13, 15, "b"],
  ])
    assert.equal(scoreWinner(a, b), w, `${a}-${b}`);
  assert.equal(validProgress(19, 17), false);
  assert.equal(validProgress(-1, 0), false);
  assert.equal(validProgress(14, 14), true);
});
test("match lock is exclusive, renews, and can be reclaimed only after expiry", () => {
  const s = initialState(),
    id = s.matches[0].id;
  op(s, { type: "start", matchId: id });
  assert.throws(
    () => op(s, { type: "claim", matchId: id }, "device-2", 2000),
    /another device/,
  );
  assert.throws(
    () =>
      op(
        s,
        { type: "score", matchId: id, side: "a", delta: 1, version: 1 },
        "device-2",
        2000,
      ),
    /locked/,
  );
  op(s, { type: "heartbeat", matchId: id }, "device-1", 2000);
  assert.equal(s.matches[0].lock.expiresAt, 2000 + LEASE_MS);
  op(s, { type: "claim", matchId: id }, "device-2", 2001 + LEASE_MS);
  assert.equal(s.matches[0].lock.owner, "device-2");
});
test("duplicate score request never adds two points; stale versions rejected", () => {
  const s = initialState(),
    m = s.matches[0];
  op(s, { type: "start", matchId: m.id });
  const a = {
    type: "score",
    matchId: m.id,
    side: "a",
    delta: 1,
    version: m.version,
    opId: "same-tap-123",
  };
  applyAction(s, a, "device-1", 1000);
  applyAction(s, a, "device-1", 1000);
  assert.equal(m.scoreA, 1);
  assert.throws(() => op(s, { ...a, opId: "stale-tap-123" }), /score changed/);
  assert.equal(m.scoreA, 1);
});
test("cannot score before start or finish prematurely; winning score awaits Finish", () => {
  const s = initialState(),
    m = s.matches[0];
  assert.throws(() =>
    op(s, { type: "score", matchId: m.id, side: "a", delta: 1, version: 0 }),
  );
  op(s, { type: "start", matchId: m.id });
  assert.throws(
    () => op(s, { type: "finish", matchId: m.id }),
    /winning score/,
  );
  for (let i = 0; i < 15; i++)
    op(s, {
      type: "score",
      matchId: m.id,
      side: "a",
      delta: 1,
      version: m.version,
    });
  assert.equal(m.status, "live");
  assert.throws(
    () =>
      op(s, {
        type: "score",
        matchId: m.id,
        side: "a",
        delta: 1,
        version: m.version,
      }),
    /Winning score|outside/,
  );
  op(s, { type: "finish", matchId: m.id });
  assert.equal(m.status, "finished");
  assert.equal(m.winner, m.a);
  assert.equal(m.lock, undefined);
  assert.throws(() =>
    op(s, {
      type: "score",
      matchId: m.id,
      side: "a",
      delta: -1,
      version: m.version,
    }),
  );
});
test("hard cap at 18–17 can finish, and score correction works", () => {
  const s = initialState(),
    m = s.matches[0];
  op(s, { type: "start", matchId: m.id });
  m.scoreA = 17;
  m.scoreB = 17;
  op(s, {
    type: "score",
    matchId: m.id,
    side: "a",
    delta: 1,
    version: m.version,
  });
  assert.equal(m.scoreA, 18);
  op(s, {
    type: "score",
    matchId: m.id,
    side: "a",
    delta: -1,
    version: m.version,
  });
  assert.equal(m.scoreA, 17);
  op(s, {
    type: "score",
    matchId: m.id,
    side: "b",
    delta: 1,
    version: m.version,
  });
  op(s, { type: "finish", matchId: m.id });
  assert.equal(m.winner, m.b);
});
test("forfeit uses backend-configured award and updates standings", () => {
  const s = initialState(),
    m = s.matches[0];
  op(s, { type: "award", matchId: m.id, side: "b", result: "forfeit" });
  assert.equal(m.scoreB, 5);
  const rows = standings(s, "MD", "A");
  assert.equal(rows[0].id, m.b);
  assert.equal(rows[0].wins, 1);
  assert.equal(rows[0].diff, 5);
  op(s, { type: "settings", forfeitPoints: 7 });
  assert.equal(m.scoreB, 5);
  const next = s.matches.find((x) => x.category === "MS");
  op(s, { type: "award", matchId: next.id, side: "a", result: "forfeit" });
  assert.equal(next.scoreA, 7);
});
test("league fixtures immutable and league byes disallowed", () => {
  const s = initialState(),
    m = s.matches[0];
  assert.throws(
    () =>
      op(s, {
        type: "editFixture",
        matchId: m.id,
        a: m.b,
        b: m.a,
        court: 1,
        time: "later",
      }),
    /League fixtures are fixed/,
  );
  assert.throws(
    () => op(s, { type: "award", matchId: m.id, side: "a", result: "bye" }),
    /Byes apply to knockouts/,
  );
});
test("published scheduling collisions are blocked at match start", () => {
  const s = initialState();
  op(s, { type: "start", matchId: "XD-A2" });
  assert.throws(
    () => op(s, { type: "start", matchId: "XD-A3" }),
    /already in another live match/,
  );
});
test("public payload hides device ownership, audit and operation identifiers", () => {
  const s = initialState();
  op(s, { type: "start", matchId: s.matches[0].id });
  const p = publicState(s);
  assert.equal(p.audit, undefined);
  assert.equal(p.operations, undefined);
  assert.equal(p.matches[0].lock.owner, undefined);
  assert.equal(p.matches[0].lock.mine, false);
  assert.equal(publicState(s, "device-1").matches[0].lock.mine, true);
});
function finishLeague(s, cat) {
  for (const m of s.matches.filter((m) => m.category === cat))
    op(s, { type: "award", matchId: m.id, side: "a", result: "forfeit" });
  for (const g of Object.keys(s.settings.qualifications[cat]))
    op(s, {
      type: "settings",
      tieOrders: {
        [`${cat}-${g}`]: s.entrants
          .filter((e) => e.category === cat && e.group === g)
          .map((e) => e.id),
      },
    });
}
test("auto draw requires complete league and resolves fixed-size seeds", () => {
  const s = initialState();
  assert.throws(
    () => op(s, { type: "draw", category: "MS" }),
    /Finish every league/,
  );
  finishLeague(s, "MS");
  op(s, { type: "draw", category: "MS" });
  assert.equal(s.matches.filter((m) => m.stage === "knockout").length, 7);
  assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.equal(
    s.matches.find((m) => m.id === "MS-KO-3-1").time,
    "5:40–6:00 PM",
  );
});
test("variable qualification creates byes and auto advances knockout winners", () => {
  const s = initialState();
  op(s, { type: "settings", qualifications: { WS: { A: 2, B: 1 } } });
  finishLeague(s, "WS");
  op(s, { type: "draw", category: "WS" });
  const ko = s.matches.filter((m) => m.stage === "knockout");
  assert.equal(ko.length, 3);
  assert.equal(ko.filter((m) => m.result === "bye").length, 1);
  const semi = ko.find((m) => m.status === "scheduled");
  op(s, { type: "award", matchId: semi.id, side: "a", result: "forfeit" });
  const final = ko.find((m) => m.round === 2);
  assert.ok(final.a && final.b);
  assert.equal(final.status, "scheduled");
  assert.ok([final.a, final.b].includes(semi.winner));
  assert.throws(
    () => op(s, { type: "removeDraw", category: "WS" }),
    /already|locked/,
  );
});
test("draw changes cannot silently invalidate a bracket", () => {
  const s = initialState();
  finishLeague(s, "MD");
  op(s, { type: "draw", category: "MD" });
  assert.throws(
    () => op(s, { type: "settings", qualifications: { MD: { A: 2 } } }),
    /Remove/,
  );
  op(s, { type: "removeDraw", category: "MD" });
  op(s, { type: "settings", qualifications: { MD: { A: 2 } } });
  assert.equal(s.settings.qualifications.MD.A, 2);
});
test("knockout opponents can swap while fixed pairs remain intact", () => {
  const s = initialState();
  finishLeague(s, "MS");
  op(s, { type: "draw", category: "MS" });
  const matches = s.matches.filter(
      (m) => m.stage === "knockout" && m.round === 1,
    ),
    a = matches[0],
    b = matches[1],
    old = a.a,
    target = b.a;
  op(s, {
    type: "editFixture",
    matchId: a.id,
    a: target,
    b: a.b,
    court: 4,
    time: "4:30 PM",
  });
  assert.equal(a.a, target);
  assert.equal(b.a, old);
  assert.equal(new Set(matches.flatMap((m) => [m.a, m.b])).size, 8);
});
test("head-to-head resolves a two-way tie only after wins and point difference", () => {
  const s = initialState();
  const group = s.entrants.filter(
    (e) => e.category === "WS" && e.group === "A",
  );
  const [a, b, c, d] = group.map((e) => e.id);
  s.matches = s.matches.filter((m) => m.category !== "WS" || m.group !== "A");
  for (const [id, left, right, sa, sb, winner] of [
    ["x1", a, b, 15, 10, a],
    ["x2", b, c, 15, 8, b],
    ["x3", c, d, 15, 0, c],
    ["x4", d, a, 15, 5, d],
  ])
    s.matches.push({
      id,
      category: "WS",
      group: "A",
      stage: "league",
      a: left,
      b: right,
      scoreA: sa,
      scoreB: sb,
      winner,
      status: "finished",
      result: "played",
    });
  // A and B each have 1 win and -5/+2 differences respectively, so diff wins.
  let rows = standings(s, "WS", "A");
  assert.ok(
    rows.findIndex((r) => r.id === b) < rows.findIndex((r) => r.id === a),
  );
  s.matches.find((m) => m.id === "x4").scoreB = 12; // A and B now share a +2 difference; A won their head-to-head.
  rows = standings(s, "WS", "A");
  const ra = rows.find((r) => r.id === a),
    rb = rows.find((r) => r.id === b);
  assert.equal(ra.diff, rb.diff);
  assert.ok(rows.indexOf(ra) < rows.indexOf(rb));
  assert.equal(ra.tied, false);
});
test("reopening knockout clears only unstarted descendants and protects started results", () => {
  const s = initialState();
  finishLeague(s, "MD");
  op(s, { type: "draw", category: "MD" });
  const semis = s.matches.filter(
    (m) => m.stage === "knockout" && m.round === 1,
  );
  for (const m of semis)
    op(s, { type: "award", matchId: m.id, side: "a", result: "forfeit" });
  const final = s.matches.find((m) => m.stage === "knockout" && m.round === 2);
  assert.ok(final.a && final.b);
  op(s, { type: "reopen", matchId: semis[0].id });
  assert.equal(final.a, null);
  assert.equal(semis[0].status, "scheduled");
  op(s, { type: "award", matchId: semis[0].id, side: "b", result: "forfeit" });
  assert.equal(final.a, semis[0].b);
  // Start manually after clearing court scheduling concerns; only final is live.
  op(s, { type: "start", matchId: final.id });
  assert.throws(
    () => op(s, { type: "reopen", matchId: semis[0].id }),
    /downstream/,
  );
});
