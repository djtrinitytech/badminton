import seed from "../data/schedule.json" with { type: "json" };

export const CATEGORIES = {
  MS: "Men’s singles",
  WS: "Women’s singles",
  MD: "Men’s doubles",
  XD: "Mixed doubles",
};
export const LEASE_MS = 90_000;
export class RuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const assert = (ok, message, status = 400) => {
  if (!ok) throw new RuleError(message, status);
};
export const label = (e) => e?.players.join(" / ") || "To be decided";
export function initialState() {
  const qualifications = {};
  for (const cat of Object.keys(CATEGORIES))
    qualifications[cat] = Object.fromEntries(
      [
        ...new Set(
          seed.entrants.filter((e) => e.category === cat).map((e) => e.group),
        ),
      ]
        .sort()
        .map((g) => [g, ["MS", "XD"].includes(cat) ? 2 : 1]),
    );
  return {
    revision: 0,
    entrants: structuredClone(seed.entrants),
    matches: structuredClone(seed.matches),
    settings: { qualifications, forfeitPoints: 5, tieOrders: {} },
    operations: [],
    audit: [],
    updatedAt: null,
  };
}
export function scoreWinner(a, b) {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0 ||
    a > 18 ||
    b > 18 ||
    a === b
  )
    return null;
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  if (
    hi < 15 ||
    (hi < 18 && hi - lo !== 2 && !(hi === 15 && lo <= 13)) ||
    (hi === 18 && lo < 16)
  )
    return null;
  return a > b ? "a" : "b";
}
export function validProgress(a, b) {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0 ||
    a > 18 ||
    b > 18
  )
    return false;
  return (
    Math.max(a, b) < 15 ||
    (Math.max(a, b) < 18 && Math.abs(a - b) < 2) ||
    !!scoreWinner(a, b)
  );
}
export function standings(state, cat, group) {
  let rows = state.entrants
    .filter((e) => e.category === cat && e.group === group)
    .map((e) => ({
      ...e,
      played: 0,
      wins: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      diff: 0,
      tied: false,
    }));
  const map = Object.fromEntries(rows.map((e) => [e.id, e]));
  const games = state.matches.filter(
    (m) =>
      m.stage === "league" &&
      m.category === cat &&
      m.group === group &&
      m.status === "finished",
  );
  for (const m of games)
    for (const [id, pf, pa] of [
      [m.a, m.scoreA, m.scoreB],
      [m.b, m.scoreB, m.scoreA],
    ]) {
      const r = map[id];
      if (!r || m.result === "bye") continue;
      r.played++;
      r.pf += pf;
      r.pa += pa;
      r.wins += Number(m.winner === id);
      r.losses += Number(m.winner !== id);
      r.diff = r.pf - r.pa;
    }
  const order = state.settings.tieOrders[`${cat}-${group}`] || [];
  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.diff - a.diff ||
      a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const out = [];
  while (rows.length) {
    const first = rows.shift(),
      bucket = [first];
    while (
      rows.length &&
      rows[0].wins === first.wins &&
      rows[0].diff === first.diff
    )
      bucket.push(rows.shift());
    let decided = bucket.length === 1;
    if (bucket.length === 2) {
      const h = games.find(
        (m) =>
          [m.a, m.b].includes(bucket[0].id) &&
          [m.a, m.b].includes(bucket[1].id),
      );
      if (h) {
        bucket.sort(
          (a, b) => Number(b.id === h.winner) - Number(a.id === h.winner),
        );
        decided = true;
      }
    }
    if (!decided && bucket.every((e) => order.includes(e.id))) {
      bucket.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      decided = true;
    }
    out.push(...bucket.map((e) => ({ ...e, tied: !decided })));
  }
  return out.map((r, i) => ({
    ...r,
    rank: i + 1,
    qualified: i < state.settings.qualifications[cat][group],
  }));
}
export function seedPositions(size) {
  let list = [1, 2];
  while (list.length < size) {
    const total = list.length * 2 + 1;
    list = list.flatMap((n) => [n, total - n]);
  }
  return list;
}
function advance(state, cat) {
  const matches = state.matches
    .filter((m) => m.stage === "knockout" && m.category === cat)
    .sort((a, b) => a.round - b.round);
  for (const m of matches) {
    if (m.status !== "scheduled") continue;
    let ready = true;
    for (const side of ["a", "b"]) {
      const source = m[`${side}Source`];
      if (source) {
        const parent = matches.find((p) => p.id === source);
        if (parent.status === "finished") m[side] = parent.winner;
        else {
          m[side] = null;
          ready = false;
        }
      }
    }
    if (ready && (!m.a || !m.b)) {
      m.status = "finished";
      m.result = "bye";
      m.winner = m.a || m.b || null;
      m.finishedAt = new Date().toISOString();
      m.version++;
    }
  }
}
function draw(state, cat) {
  assert(CATEGORIES[cat], "Unknown category.");
  assert(
    state.matches
      .filter((m) => m.category === cat && m.stage === "league")
      .every((m) => m.status === "finished"),
    "Finish every league match in this category before drawing knockouts.",
  );
  assert(
    !state.matches.some(
      (m) =>
        m.category === cat &&
        m.stage === "knockout" &&
        (m.status === "live" ||
          (m.status === "finished" && m.result !== "bye")),
    ),
    "A knockout has already started. Its draw cannot be replaced.",
  );
  const qualifiers = [];
  for (const group of Object.keys(state.settings.qualifications[cat])) {
    const rows = standings(state, cat, group),
      n = state.settings.qualifications[cat][group];
    // A tied bucket must be resolved if any member qualifies, including seeding ties.
    assert(
      !rows.slice(0, n).some((r) => r.tied),
      `Resolve the standings tie in Group ${group} before drawing.`,
    );
    qualifiers.push(...rows.slice(0, n));
  }
  assert(
    qualifiers.length >= 2,
    "Choose at least two qualifiers in this category.",
  );
  qualifiers.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.wins - a.wins ||
      b.diff - a.diff ||
      a.group.localeCompare(b.group),
  );
  const size = 2 ** Math.ceil(Math.log2(qualifiers.length)),
    positions = seedPositions(size),
    rounds = Math.log2(size);
  state.matches = state.matches.filter(
    (m) => m.category !== cat || m.stage !== "knockout",
  );
  for (let round = 1; round <= rounds; round++)
    for (let i = 0; i < size / 2 ** round; i++) {
      const count = size / 2 ** round,
        name =
          count === 1
            ? "Final"
            : count === 2
              ? "Semifinal"
              : count === 4
                ? "Quarterfinal"
                : `Round of ${count * 2}`;
      const remaining = rounds - round;
      const slots = {
        MS: {
          0: ["5:40–6:00 PM", [3]],
          1: ["5:00–5:20 PM", [1, 2]],
          2: ["4:20–4:40 PM", [1, 2, 3, 4]],
        },
        MD: { 0: ["5:20–5:40 PM", [1]], 1: ["4:40–5:00 PM", [1, 2]] },
        WS: { 0: ["5:00–5:20 PM", [3]] },
        XD: { 0: ["5:40–6:00 PM", [2]], 1: ["5:20–5:40 PM", [3, 4]] },
      };
      const slot = slots[cat][remaining];
      const m = {
        id: `${cat}-KO-${round}-${i + 1}`,
        label: `${cat} ${name} ${i + 1}`,
        category: cat,
        group: null,
        stage: "knockout",
        round,
        a: null,
        b: null,
        aSource: null,
        bSource: null,
        court: slot?.[1][i] || null,
        time: slot?.[0] || "To be scheduled",
        scoreA: 0,
        scoreB: 0,
        status: "scheduled",
        winner: null,
        version: 0,
      };
      if (round === 1) {
        m.a = qualifiers[positions[i * 2] - 1]?.id || null;
        m.b = qualifiers[positions[i * 2 + 1] - 1]?.id || null;
      } else {
        m.aSource = `${cat}-KO-${round - 1}-${i * 2 + 1}`;
        m.bSource = `${cat}-KO-${round - 1}-${i * 2 + 2}`;
      }
      state.matches.push(m);
    }
  advance(state, cat);
}
export function applyAction(state, action, owner, now = Date.now()) {
  assert(
    typeof action.opId === "string" &&
      action.opId.length >= 8 &&
      action.opId.length <= 100,
    "Missing operation identifier.",
  );
  if (state.operations.includes(action.opId)) return { duplicate: true };
  const match = state.matches.find((m) => m.id === action.matchId);
  const own = () =>
    assert(
      match.lock?.owner === owner && match.lock.expiresAt > now,
      "This match is locked by another device, or your scoring lease expired. Resume scoring to continue.",
      409,
    );
  if (
    [
      "start",
      "claim",
      "heartbeat",
      "score",
      "finish",
      "award",
      "editFixture",
      "reopen",
    ].includes(action.type)
  )
    assert(match, "Match not found.", 404);
  if (["start", "claim"].includes(action.type)) {
    assert(match.status !== "finished", "This match is already finished.");
    assert(match.a && match.b, "Both opponents must be assigned.");
    assert(
      !match.lock || match.lock.owner === owner || match.lock.expiresAt <= now,
      "Scoring is in progress on another device.",
      409,
    );
    if (action.type === "start")
      assert(
        match.status === "scheduled",
        "Match is already live. Use Resume scoring.",
      );
    // Court assignments are informational; only an overlapping participant blocks a start.
    const players = state.entrants
      .filter((e) => [match.a, match.b].includes(e.id))
      .flatMap((e) => e.players)
      .map((n) => n.toLowerCase().trim());
    assert(
      !state.matches.some(
        (m) =>
          m.id !== match.id &&
          m.status === "live" &&
          state.entrants
            .filter((e) => [m.a, m.b].includes(e.id))
            .some((e) =>
              e.players.some((p) => players.includes(p.toLowerCase().trim())),
            ),
      ),
      "A participant is already in another live match.",
      409,
    );
    match.status = "live";
    match.startedAt ||= new Date(now).toISOString();
    match.lock = { owner, expiresAt: now + LEASE_MS };
  } else if (action.type === "heartbeat") {
    own();
    match.lock.expiresAt = now + LEASE_MS;
  } else if (action.type === "score") {
    own();
    assert(match.status === "live", "Start the match before scoring.");
    assert(
      action.version === match.version,
      "The score changed. Review the latest score and tap again.",
      409,
    );
    assert(
      ["a", "b"].includes(action.side) && [-1, 1].includes(action.delta),
      "Invalid score change.",
    );
    const key = action.side === "a" ? "scoreA" : "scoreB",
      next = match[key] + action.delta;
    const a = key === "scoreA" ? next : match.scoreA,
      b = key === "scoreB" ? next : match.scoreB;
    assert(
      validProgress(a, b),
      "That score is outside the 15-point, win-by-2, cap-18 rules.",
    );
    if (action.delta === 1)
      assert(
        !scoreWinner(match.scoreA, match.scoreB),
        "Winning score reached. Finish the match or correct the score.",
      );
    match[key] = next;
    match.lock.expiresAt = now + LEASE_MS;
  } else if (action.type === "finish") {
    own();
    assert(match.status === "live", "This match is not live.");
    const side = scoreWinner(match.scoreA, match.scoreB);
    assert(side, "A valid winning score is required before finishing.");
    match.winner = match[side];
    match.status = "finished";
    match.result = "played";
    match.finishedAt = new Date(now).toISOString();
    delete match.lock;
    advance(state, match.category);
  } else if (action.type === "award") {
    assert(match.status !== "finished", "This match is already finished.");
    assert(
      !match.lock || match.lock.owner === owner || match.lock.expiresAt <= now,
      "Scoring is in progress on another device.",
      409,
    );
    assert(
      ["a", "b"].includes(action.side) && match[action.side],
      "Choose a winner.",
    );
    assert(
      ["forfeit", "bye"].includes(action.result),
      "Choose forfeit or bye.",
    );
    assert(
      action.result !== "bye" || match.stage === "knockout",
      "Byes apply to knockouts. Use forfeit for a league absence.",
    );
    assert(
      !["aSource", "bSource"].some(
        (key) =>
          match[key] &&
          state.matches.find((m) => m.id === match[key])?.status !== "finished",
      ),
      "Wait for the feeder matches to finish, or edit this knockout fixture explicitly.",
    );
    if (action.result === "forfeit")
      assert(
        match.a && match.b,
        "Both opponents must be assigned before awarding a forfeit.",
      );
    match.winner = match[action.side];
    match.status = "finished";
    match.result = action.result;
    match.scoreA =
      action.result === "bye"
        ? 0
        : action.side === "a"
          ? state.settings.forfeitPoints
          : 0;
    match.scoreB =
      action.result === "bye"
        ? 0
        : action.side === "b"
          ? state.settings.forfeitPoints
          : 0;
    match.finishedAt = new Date(now).toISOString();
    delete match.lock;
    advance(state, match.category);
  } else if (action.type === "settings") {
    const { qualifications, forfeitPoints, tieOrders } = action;
    if (qualifications) {
      for (const [cat, groups] of Object.entries(qualifications)) {
        assert(CATEGORIES[cat], "Invalid category.");
        assert(
          !state.matches.some(
            (m) => m.category === cat && m.stage === "knockout",
          ),
          "Remove the unstarted knockout draw before changing qualification counts.",
        );
        for (const [group, n] of Object.entries(groups))
          assert(
            group in state.settings.qualifications[cat] &&
              Number.isInteger(n) &&
              n >= 0 &&
              n <=
                state.entrants.filter(
                  (e) => e.category === cat && e.group === group,
                ).length,
            "Invalid qualification count.",
          );
        Object.assign(state.settings.qualifications[cat], groups);
      }
    }
    if (forfeitPoints !== undefined) {
      assert(
        Number.isInteger(forfeitPoints) &&
          forfeitPoints >= 1 &&
          forfeitPoints <= 18,
        "Forfeit award must be 1–18.",
      );
      state.settings.forfeitPoints = forfeitPoints;
    }
    if (tieOrders) {
      for (const [key, ids] of Object.entries(tieOrders)) {
        const [cat, group] = key.split("-"),
          allowed = state.entrants
            .filter((e) => e.category === cat && e.group === group)
            .map((e) => e.id);
        assert(
          Array.isArray(ids) &&
            ids.length === allowed.length &&
            new Set(ids).size === ids.length &&
            ids.every((id) => allowed.includes(id)),
          "Tie order must include each group participant once.",
        );
        assert(
          !state.matches.some(
            (m) => m.category === cat && m.stage === "knockout",
          ),
          "Remove the unstarted draw before changing tie order.",
        );
        state.settings.tieOrders[key] = ids;
      }
    }
  } else if (action.type === "draw") draw(state, action.category);
  else if (action.type === "removeDraw") {
    assert(CATEGORIES[action.category], "Invalid category.");
    assert(
      !state.matches.some(
        (m) =>
          m.category === action.category &&
          m.stage === "knockout" &&
          (m.status === "live" ||
            (m.status === "finished" && m.result !== "bye")),
      ),
      "A knockout has started. The draw is locked.",
    );
    state.matches = state.matches.filter(
      (m) => m.category !== action.category || m.stage !== "knockout",
    );
  } else if (action.type === "editFixture") {
    assert(match.stage === "knockout", "League fixtures are fixed.");
    assert(
      match.status === "scheduled",
      "Only unstarted fixtures can be edited.",
    );
    assert(
      !state.matches.some(
        (m) =>
          m.category === match.category &&
          m.stage === "knockout" &&
          m.round > match.round &&
          m.status !== "scheduled" &&
          m.result !== "bye",
      ),
      "A later round has already started.",
    );
    assert(
      action.a && action.b && action.a !== action.b,
      "Choose two different opponents.",
    );
    assert(
      [action.a, action.b].every((id) =>
        state.entrants.some(
          (e) => e.id === id && e.category === match.category,
        ),
      ),
      "Opponents must belong to this category.",
    );
    assert(
      Number.isInteger(action.court) && action.court >= 1 && action.court <= 4,
      "Choose court 1–4.",
    );
    assert(
      typeof action.time === "string" &&
        action.time.trim().length > 0 &&
        action.time.length <= 80,
      "Enter a valid time.",
    );
    // Re-seeding swaps slots atomically so a participant never appears twice in a round.
    const peers = state.matches.filter(
      (m) =>
        m.category === match.category &&
        m.stage === "knockout" &&
        m.round === match.round,
    );
    for (const side of ["a", "b"]) {
      const target = action[side];
      if (match[side] === target) continue;
      const peer = peers.find(
        (m) => m.id !== match.id && [m.a, m.b].includes(target),
      );
      if (peer) {
        assert(
          peer.status === "scheduled",
          "That opponent is in a match that has already started.",
        );
        const slot = peer.a === target ? "a" : "b";
        peer[slot] = match[side];
        peer[`${slot}Source`] = null;
        peer.version++;
      } else if (match[side === "a" ? "b" : "a"] === target) {
        const opposite = side === "a" ? "b" : "a";
        match[opposite] = match[side];
        match[`${opposite}Source`] = null;
      }
      match[side] = target;
      match[`${side}Source`] = null;
    }
    if (match.a !== action.a) {
      match.a = action.a;
      match.aSource = null;
    }
    if (match.b !== action.b) {
      match.b = action.b;
      match.bSource = null;
    }
    match.court = action.court;
    match.time = action.time.trim();
  } else if (action.type === "reopen") {
    assert(
      match.status === "finished",
      "Only completed matches can be reopened.",
    );
    if (match.stage === "league")
      assert(
        !state.matches.some(
          (m) => m.category === match.category && m.stage === "knockout",
        ),
        "Remove the unstarted knockout draw before reopening a league result.",
      );
    else {
      const affected = new Set([match.id]);
      for (const m of state.matches
        .filter((m) => m.category === match.category && m.stage === "knockout")
        .sort((a, b) => a.round - b.round))
        if (affected.has(m.aSource) || affected.has(m.bSource))
          affected.add(m.id);
      const children = state.matches.filter(
        (m) => m.id !== match.id && affected.has(m.id),
      );
      assert(
        !children.some(
          (m) =>
            m.status === "live" ||
            (m.status === "finished" && m.result !== "bye"),
        ),
        "A downstream match has already started. This result cannot be reopened.",
      );
      for (const m of children) {
        m.status = "scheduled";
        m.winner = null;
        m.result = null;
        m.scoreA = 0;
        m.scoreB = 0;
        m.finishedAt = null;
        delete m.lock;
        for (const side of ["a", "b"])
          if (affected.has(m[`${side}Source`])) m[side] = null;
        m.version++;
      }
    }
    match.status = "scheduled";
    match.winner = null;
    match.result = null;
    match.finishedAt = null;
  } else throw new RuleError("Unknown action.");
  if (match && action.type !== "heartbeat") match.version++;
  if (action.type !== "heartbeat") {
    state.revision++;
    state.updatedAt = new Date(now).toISOString();
    state.audit.unshift({
      at: state.updatedAt,
      action: action.type,
      matchId: match?.id || null,
      score: match ? [match.scoreA, match.scoreB] : null,
      device: owner.slice(0, 8),
    });
    state.audit = state.audit.slice(0, 500);
  }
  state.operations.push(action.opId);
  state.operations = state.operations.slice(-3000);
  return { duplicate: false };
}
export function publicState(state, owner = null) {
  const copy = structuredClone(state);
  delete copy.operations;
  delete copy.audit;
  for (const m of copy.matches) {
    if (m.lock) {
      m.lock = {
        mine: !!owner && m.lock.owner === owner,
        expiresAt: m.lock.expiresAt,
      };
    }
  }
  return copy;
}
