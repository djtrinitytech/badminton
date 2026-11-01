"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  GitBranch,
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  X,
  Plus,
  Minus,
  Check,
  CheckCheck,
  LockKeyhole,
  LogOut,
  Play,
  Flag,
  Trophy,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  Settings2,
  Clock3,
  MapPin,
  Grip,
  ArrowUp,
  ArrowDown,
  Download,
  Info,
  LoaderCircle,
} from "lucide-react";
import {
  CATEGORIES,
  standings,
  label,
  scoreWinner,
} from "../lib/tournament.mjs";

const TABS = [
  ["live", "Courts", Activity],
  ["schedule", "Fixtures", CalendarDays],
  ["standings", "Standings", ChartNoAxesColumnIncreasing],
  ["knockouts", "Knockouts", GitBranch],
];
const CAT_SHORT = {
  MS: "Men’s singles",
  WS: "Women’s singles",
  MD: "Men’s doubles",
  XD: "Mixed doubles",
};
const makeId = () => crypto.randomUUID();
function Shuttle({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 38 7 11l13 5 7-10 7 10 14-5-12 28"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="m20 16 6 22m8-22-3 22M12 23l30 0M18 33h20"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M19 39h19v7c0 7-5 11-10 11s-9-4-9-11v-7Z" fill="currentColor" />
    </svg>
  );
}
function CourtArt() {
  return (
    <svg
      viewBox="0 0 380 240"
      className="court-art"
      fill="none"
      aria-hidden="true"
    >
      <g transform="translate(15 20) rotate(-12 175 100)">
        <path
          d="M25 25h300v170H25z"
          fill="#225a40"
          stroke="#b9ddba"
          strokeWidth="1.5"
        />
        <path
          d="M25 43h300M25 177h300M25 110h300M75 25v170M275 25v170M75 78h200M75 142h200M175 25v170"
          stroke="#a7d2a9"
          strokeWidth="1.2"
        />
        <path d="M15 110h325" stroke="#e1fa68" strokeWidth="3" />
        <path d="M15 83v50m325-50v50" stroke="#e1fa68" strokeWidth="3" />
        <circle cx="110" cy="66" r="9" fill="#d9ee76" />
        <circle cx="232" cy="155" r="9" fill="#fff6d7" />
        <path
          d="m119 70 54 28 51 42"
          stroke="#e1fa68"
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
        <circle cx="172" cy="98" r="3" fill="#fff" />
      </g>
    </svg>
  );
}
function Status({ match }) {
  return (
    <span className={`status ${match.status}`}>
      {match.status === "live" ? (
        <>
          <i /> Live
        </>
      ) : match.status === "finished" ? (
        <>
          <Check size={11} />
          {match.result === "bye"
            ? "Bye"
            : match.result === "forfeit"
              ? "Forfeit"
              : "Final"}
        </>
      ) : (
        <>
          <Clock3 size={11} />
          Upcoming
        </>
      )}
    </span>
  );
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", handler);
    };
  }, [onClose]);
  const box = useRef();
  useEffect(() => {
    const prior = document.activeElement;
    box.current?.focus();
    return () => prior?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={box}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const nodes = [
              ...e.currentTarget.querySelectorAll(
                "button:not(:disabled),input,select,a[href]",
              ),
            ];
            const first = nodes[0],
              last = nodes.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function Tournament() {
  const [state, setState] = useState(null),
    [admin, setAdmin] = useState(false),
    [tab, setTab] = useState("live"),
    [category, setCategory] = useState("all"),
    [selected, setSelected] = useState(null),
    [dialog, setDialog] = useState(null),
    [busy, setBusy] = useState(false),
    [save, setSave] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [connected, setConnected] = useState(false),
    [online, setOnline] = useState(true),
    [storage, setStorage] = useState(""),
    [real, setReal] = useState(false),
    [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [now, setNow] = useState(Date.now()),
    [retry, setRetry] = useState(null);
  const stateRef = useRef(null),
    busyRef = useRef(false),
    ablyRef = useRef(null),
    refetchRef = useRef(null);
  const accept = useCallback((next) => {
    if (!stateRef.current || next.revision >= stateRef.current.revision) {
      stateRef.current = next;
      setState(next);
    }
  }, []);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      accept(data.state);
      setAdmin(data.admin);
      setStorage(data.storage);
      setReal(data.realtime);
      setOnline(true);
      setError("");
      return data;
    } catch (e) {
      setOnline(false);
      setError(e.message);
      return null;
    }
  }, [accept]);
  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    const offline = () => setOnline(false);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(id);
      clearInterval(tick);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("offline", offline);
    };
  }, [load]);
  useEffect(() => {
    if (!real) return;
    let disposed = false;
    import("ably").then(({ Realtime }) => {
      if (disposed) return;
      const client = new Realtime({
        authUrl: "/api/realtime",
        autoConnect: true,
      });
      ablyRef.current = client;
      client.connection.on((change) => {
        if (!disposed) setConnected(change.current === "connected");
      });
      client.channels.get("vyuha:scores").subscribe("updated", () => {
        clearTimeout(refetchRef.current);
        refetchRef.current = setTimeout(load, 35);
      });
      client.connection.on("connected", load);
    });
    return () => {
      disposed = true;
      ablyRef.current?.close();
      clearTimeout(refetchRef.current);
    };
  }, [real, load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const act = useCallback(
    async (action, quiet = false) => {
      if (!quiet && busyRef.current) return false;
      if (!quiet) {
        busyRef.current = true;
        setBusy(true);
        setSave("Saving…");
        setRetry(null);
      }
      const payload = { ...action, opId: action.opId || makeId() };
      try {
        const res = await fetch("/api/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
          data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            setAdmin(false);
            setDialog("login");
          }
          throw Object.assign(new Error(data.error), { confirmed: true });
        }
        accept(data.state);
        if (!quiet) {
          setSave("Saved");
          setError("");
          if (!data.broadcast && real)
            setToast(
              "Saved. Realtime is reconnecting; viewers will synchronize automatically.",
            );
        }
        return true;
      } catch (e) {
        if (!quiet) {
          setToast(
            e.message || "Could not confirm the save. Reconnect and retry.",
          );
          setSave("Save failed");
          if (!e.confirmed) setRetry(payload);
          await load();
        }
        return false;
      } finally {
        if (!quiet) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [accept, load, real],
  );
  useEffect(() => {
    if (!admin) return;
    const id = setInterval(() => {
      for (const m of stateRef.current?.matches || [])
        if (
          m.status === "live" &&
          m.lock?.mine &&
          m.lock.expiresAt > Date.now()
        )
          act({ type: "heartbeat", matchId: m.id }, true);
    }, 20000);
    return () => clearInterval(id);
  }, [admin, act]);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("view");
    if (TABS.some(([id]) => id === t)) setTab(t);
    if (new URLSearchParams(window.location.search).has("admin"))
      setDialog("login");
  }, []);
  const navigate = (id) => {
    setTab(id);
    window.history.replaceState(null, "", `?view=${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const selectedMatch = state?.matches.find((m) => m.id === selected);
  const entrant = (id) => state?.entrants.find((e) => e.id === id);
  const name = (id) => label(entrant(id));
  const visible =
    state?.matches.filter(
      (m) =>
        (category === "all" || m.category === category) &&
        (!search ||
          `${name(m.a)} ${name(m.b)} ${m.label}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (statusFilter === "all" || m.status === statusFilter),
    ) || [];
  const counts = state
    ? {
        live: state.matches.filter((m) => m.status === "live").length,
        finished: state.matches.filter((m) => m.status === "finished").length,
        total: state.matches.length,
      }
    : {};
  const categories = category === "all" ? Object.keys(CATEGORIES) : [category];
  const modalClose = useCallback(() => {
    setSelected(null);
    setDialog(null);
  }, []);
  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    const password = new FormData(e.currentTarget).get("password");
    try {
      const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      setDialog(null);
      setToast("You’re signed in. Select a match to start scoring.");
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a className="brand" href="/" aria-label="Vyuha home">
            <span className="brand-icon">
              <Shuttle />
            </span>
            <span>
              VYŪHA<span className="brand-year"> / 2026</span>
              <small>DJSCE TRINITY</small>
            </span>
          </a>
          <div className="topbar-right">
            <span className={`connection ${online ? "" : "offline"}`}>
              {online ? (
                connected ? (
                  <Wifi size={13} />
                ) : (
                  <RefreshCw size={13} />
                )
              ) : (
                <WifiOff size={13} />
              )}
              <span>
                {online
                  ? connected
                    ? "Live updates"
                    : "Auto-sync"
                  : "Offline"}
              </span>
            </span>
            {admin ? (
              <>
                <button
                  className="admin-btn"
                  onClick={() => setDialog("settings")}
                >
                  <Settings2 size={15} />
                  <span>Manage</span>
                </button>
                <button
                  className="icon-btn logout"
                  aria-label="Sign out of admin"
                  onClick={async () => {
                    await fetch("/api/auth", { method: "DELETE" });
                    await load();
                    setToast(
                      "Signed out. Your active match lock expires after 90 seconds.",
                    );
                  }}
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button className="admin-btn" onClick={() => setDialog("login")}>
                <LockKeyhole size={14} />
                <span>Admin</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="shell">
        {admin && (
          <div className="admin-strip">
            <ShieldCheck size={15} />
            <span>
              Admin mode <b>·</b> Changes save automatically
            </span>
            <span className="save-state" aria-live="polite">
              {busy ? (
                <LoaderCircle size={13} className="spin" />
              ) : (
                <CheckCheck size={13} />
              )}{" "}
              {save || "Ready to score"}
            </span>
          </div>
        )}
        {storage === "local" && (
          <div className="demo-strip">
            <Info size={14} /> Local preview · Scores are stored on this
            computer. Connect Postgres and Ably before deploying.
          </div>
        )}
        <section className={`hero ${tab !== "live" ? "compact" : ""}`}>
          <div className="hero-content">
            <div className="eyebrow">
              <span className="tiny-shuttle">✦</span> THE COURT IS CALLING
            </div>
            <h1>
              EVERY RALLY.
              <br />
              <span>RIGHT HERE.</span>
            </h1>
            <p>
              Your courtside companion for VYŪHA badminton.
              <br className="desktop-break" /> Follow the scores. Back your
              players. Catch every point.
            </p>
            <div className="hero-tags">
              <span>
                <MapPin size={13} />
                DJSCE · Trinity 2026
              </span>
              <span>
                <i />
                15 points. Cap at 18.
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <span className="visual-label">FOUR COURTS. ONE GAME.</span>
            <CourtArt />
            <div className="visual-bottom">
              <Shuttle />
              <span>
                PLAY HARD.
                <br />
                STAY IN THE GAME.
              </span>
              <ArrowUpRight size={22} />
            </div>
          </div>
        </section>
        <section className="overview" aria-label="Tournament overview">
          <div>
            <span className="stat-icon green">
              <Activity size={18} />
            </span>
            <span>
              <strong>
                {counts.live ?? "—"}
                <small className="live-word"> LIVE</small>
              </strong>
              <small>Matches on court</small>
            </span>
          </div>
          <div>
            <span className="stat-icon sand">
              <CheckCheck size={19} />
            </span>
            <span>
              <strong>
                {counts.finished ?? "—"}
                <em> / {counts.total ?? "—"}</em>
              </strong>
              <small>Matches completed</small>
            </span>
          </div>
          <div>
            <span className="stat-icon lilac">
              <Trophy size={18} />
            </span>
            <span>
              <strong>
                4 <em>categories</em>
              </strong>
              <small>Singles & doubles</small>
            </span>
          </div>
          <div className="overview-note">
            <span className="note-dot" />
            <span>
              ONE POINT AT A TIME.
              <small>All scores update automatically.</small>
            </span>
          </div>
        </section>
        <div className="section-nav">
          <nav aria-label="Tournament views">
            {TABS.map(([id, text, Icon]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => navigate(id)}
              >
                <Icon size={17} />
                {text}
                {id === "live" && counts.live > 0 && (
                  <span className="nav-count">{counts.live}</span>
                )}
              </button>
            ))}
          </nav>
          <button className="rules-link" onClick={() => setDialog("rules")}>
            <Info size={14} />
            Tournament rules
          </button>
        </div>
        <div className="content-heading">
          <div>
            <div className="eyebrow dark">
              {tab === "live"
                ? "THE ACTION, AS IT HAPPENS"
                : tab === "schedule"
                  ? "KNOW WHAT’S NEXT"
                  : tab === "standings"
                    ? "THE ROAD TO QUALIFICATION"
                    : "THE RACE TO THE TITLE"}
            </div>
            <h2>
              {tab === "live"
                ? "Around the courts"
                : tab === "schedule"
                  ? "Match fixtures"
                  : tab === "standings"
                    ? "Group standings"
                    : "Knockout stage"}
              <span className="heading-dot">.</span>
            </h2>
          </div>
          <span className="heading-caption">
            {tab === "live"
              ? "Four courts. Every point covered."
              : tab === "schedule"
                ? "League schedule · As published"
                : tab === "standings"
                  ? "Wins → Point difference → Head-to-head"
                  : "Win. Advance. Repeat."}
          </span>
        </div>
        <div className="filters" role="group" aria-label="Filter by category">
          <button
            className={category === "all" ? "selected" : ""}
            onClick={() => setCategory("all")}
          >
            All events
          </button>
          {Object.entries(CAT_SHORT).map(([id, text]) => (
            <button
              key={id}
              className={category === id ? "selected" : ""}
              onClick={() => setCategory(id)}
            >
              {text}
            </button>
          ))}
        </div>
        {!state ? (
          <div className="loading-panel">
            {error ? (
              <>
                <WifiOff size={28} />
                <h3>Let’s get connected</h3>
                <p>{error}</p>
                <button className="primary" onClick={load}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <LoaderCircle className="spin" size={28} />
                <p>Getting the courts ready…</p>
              </>
            )}
          </div>
        ) : (
          <>
            {error && (
              <div className="error-banner" role="alert">
                <WifiOff size={16} />
                <span>
                  Connection interrupted. Displaying the last confirmed scores.
                </span>
                <button onClick={load}>Reconnect</button>
              </div>
            )}
            {retry && (
              <div className="error-banner">
                <span>
                  A save could not be confirmed. Retry is safe and won’t add the
                  point twice.
                </span>
                <button disabled={busy} onClick={() => act(retry)}>
                  Retry save
                </button>
              </div>
            )}
            {tab === "live" && (
              <>
                <div className="court-grid">
                  {[1, 2, 3, 4].map((court) => {
                    const onCourt = state.matches.find(
                      (m) => m.court === court && m.status === "live",
                    );
                    const next = state.matches.find(
                      (m) =>
                        m.court === court &&
                        m.status === "scheduled" &&
                        (category === "all" || m.category === category),
                    );
                    const m = onCourt || next;
                    return (
                      <article
                        className={`court-card ${onCourt ? "is-live" : ""}`}
                        key={court}
                      >
                        <div className="court-card-top">
                          <span className="court-title">
                            <span className="court-number">0{court}</span> COURT{" "}
                            {court}
                          </span>
                          {onCourt ? (
                            <Status match={onCourt} />
                          ) : (
                            <span className="court-ready">Ready for play</span>
                          )}
                        </div>
                        {m ? (
                          <>
                            <div className="match-category">
                              <span>{m.category}</span>
                              {CATEGORIES[m.category]}
                              <b>·</b>
                              {m.stage === "league"
                                ? `Group ${m.group}`
                                : "Knockout"}
                            </div>
                            <div className="score-rows">
                              {["a", "b"].map((side) => (
                                <div
                                  key={side}
                                  className={`score-row ${m.winner === m[side] ? "winner" : ""}`}
                                >
                                  <span className="player-name">
                                    {entrant(m[side])?.players.map((n, i) => (
                                      <span key={i}>{n}</span>
                                    )) || "To be decided"}
                                  </span>
                                  <strong>
                                    {m[side === "a" ? "scoreA" : "scoreB"]}
                                  </strong>
                                </div>
                              ))}
                            </div>
                            <div className="court-card-bottom">
                              <span>
                                {onCourt ? (
                                  <>
                                    <span className="pulse-dot" />
                                    Scoring in progress
                                  </>
                                ) : (
                                  <>
                                    <Clock3 size={13} />
                                    {m.time}
                                  </>
                                )}
                              </span>
                              <button onClick={() => setSelected(m.id)}>
                                {admin
                                  ? m.lock?.mine
                                    ? "Score match"
                                    : onCourt
                                      ? "View match"
                                      : "Start match"
                                  : "Match details"}
                                <ArrowUpRight size={16} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="court-empty">
                            <Shuttle />
                            <p>A little breather.</p>
                            <small>No upcoming match in this category.</small>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="section-subheading">
                  <h3>
                    Next up <span>On the schedule</span>
                  </h3>
                  <button
                    className="text-btn"
                    onClick={() => navigate("schedule")}
                  >
                    All fixtures <ArrowRight size={15} />
                  </button>
                </div>
                <div className="next-list">
                  {visible
                    .filter((m) => m.status === "scheduled")
                    .slice(0, 4)
                    .map((m) => (
                      <MatchRow
                        key={m.id}
                        match={m}
                        name={name}
                        onClick={() => setSelected(m.id)}
                      />
                    ))}
                  {!visible.some((m) => m.status === "scheduled") && (
                    <Empty text="All scheduled matches in this view are complete." />
                  )}
                </div>
                {state.matches.some((m) => m.status === "finished") && (
                  <>
                    <div className="section-subheading">
                      <h3>
                        Just finished <span>The latest results</span>
                      </h3>
                    </div>
                    <div className="next-list">
                      {visible
                        .filter((m) => m.status === "finished")
                        .sort((a, b) =>
                          (b.finishedAt || "").localeCompare(
                            a.finishedAt || "",
                          ),
                        )
                        .slice(0, 4)
                        .map((m) => (
                          <MatchRow
                            key={m.id}
                            match={m}
                            name={name}
                            onClick={() => setSelected(m.id)}
                          />
                        ))}
                    </div>
                  </>
                )}
              </>
            )}
            {tab === "schedule" && (
              <>
                <div className="list-toolbar">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search players or matches"
                      placeholder="Find a player or match…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className="icon-btn"
                        aria-label="Clear search"
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <select
                    aria-label="Match status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All matches</option>
                    <option value="scheduled">Upcoming</option>
                    <option value="live">Live</option>
                    <option value="finished">Finished</option>
                  </select>
                </div>
                <div className="fixture-note">
                  <Info size={14} />
                  <span>
                    Published times are retained. Matches sharing a court or
                    player cannot start simultaneously.
                    {admin
                      ? " League fixtures are fixed; knockout fixtures can be edited."
                      : ""}
                  </span>
                </div>
                <div className="schedule-list">
                  {visible.map((m) => (
                    <MatchRow
                      key={m.id}
                      match={m}
                      name={name}
                      onClick={() => setSelected(m.id)}
                    />
                  ))}
                  {!visible.length && (
                    <Empty text="No matches found. Try another filter." />
                  )}
                </div>
              </>
            )}
            {tab === "standings" && (
              <div className="standings-grid">
                {categories.map((cat) =>
                  Object.keys(state.settings.qualifications[cat]).map(
                    (group) => {
                      const rows = standings(state, cat, group),
                        played = state.matches.filter(
                          (m) =>
                            m.category === cat &&
                            m.group === group &&
                            m.status === "finished",
                        ).length,
                        total = state.matches.filter(
                          (m) => m.category === cat && m.group === group,
                        ).length;
                      return (
                        <section
                          className="standings-card"
                          key={`${cat}-${group}`}
                        >
                          <div className="standings-head">
                            <div>
                              <span className="category-code">{cat}</span>
                              <h3>
                                {CATEGORIES[cat]}
                                <small>Group {group}</small>
                              </h3>
                            </div>
                            <span className="qualify-note">
                              Top {state.settings.qualifications[cat][group]}{" "}
                              advance
                            </span>
                          </div>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Player / pair</th>
                                  <th title="Played">P</th>
                                  <th title="Wins">W</th>
                                  <th title="Losses">L</th>
                                  <th title="Points for">PF</th>
                                  <th title="Points against">PA</th>
                                  <th title="Point difference">+/−</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => (
                                  <tr
                                    key={r.id}
                                    className={r.qualified ? "qualifying" : ""}
                                  >
                                    <td>
                                      <span className="rank">{r.rank}</span>
                                    </td>
                                    <td>
                                      {r.players.map((p, i) => (
                                        <span key={i}>{p}</span>
                                      ))}
                                      {r.tied && played === total && (
                                        <small className="tie-label">
                                          Tie · admin decision needed
                                        </small>
                                      )}
                                    </td>
                                    <td>{r.played}</td>
                                    <td className="wins">{r.wins}</td>
                                    <td>{r.losses}</td>
                                    <td>{r.pf}</td>
                                    <td>{r.pa}</td>
                                    <td className="diff">
                                      {r.diff > 0 ? "+" : ""}
                                      {r.diff}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="table-foot">
                            <span>
                              <i />
                              Qualification positions · provisional until
                              complete
                            </span>
                            <span>
                              {played}/{total} played
                            </span>
                          </div>
                          {admin && (
                            <button
                              className="table-admin"
                              onClick={() =>
                                setDialog({ type: "tie", category: cat, group })
                              }
                            >
                              <Settings2 size={14} />
                              Set order for unresolved ties
                            </button>
                          )}
                        </section>
                      );
                    },
                  ),
                )}
              </div>
            )}
            {tab === "knockouts" && (
              <div className="bracket-categories">
                {categories.map((cat) => {
                  const matches = state.matches.filter(
                      (m) => m.category === cat && m.stage === "knockout",
                    ),
                    league = state.matches.filter(
                      (m) => m.category === cat && m.stage === "league",
                    ),
                    done = league.filter((m) => m.status === "finished").length,
                    rounds = [...new Set(matches.map((m) => m.round))];
                  return (
                    <section className="bracket-card" key={cat}>
                      <div className="bracket-head">
                        <div>
                          <span className="category-code">{cat}</span>
                          <h3>
                            {CATEGORIES[cat]}
                            <small>
                              {matches.length
                                ? "The road to the final"
                                : `${done} of ${league.length} league matches complete`}
                            </small>
                          </h3>
                        </div>
                        {admin && (
                          <button
                            className="secondary small"
                            disabled={busy}
                            onClick={() =>
                              matches.length
                                ? setDialog({ type: "remove", category: cat })
                                : act({ type: "draw", category: cat })
                            }
                          >
                            {matches.length ? (
                              <>
                                <RefreshCw size={14} />
                                Reset draw
                              </>
                            ) : (
                              <>
                                <GitBranch size={15} />
                                Auto draw
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {matches.length ? (
                        <div className="bracket-scroll">
                          {rounds.map((round) => (
                            <div className="bracket-round" key={round}>
                              <h4>
                                {round === rounds.at(-1)
                                  ? "FINAL"
                                  : round === rounds.at(-1) - 1
                                    ? "SEMIFINALS"
                                    : `ROUND OF ${2 * matches.filter((m) => m.round === round).length}`}
                              </h4>
                              <div className="bracket-round-matches">
                                {matches
                                  .filter((m) => m.round === round)
                                  .map((m) => (
                                    <button
                                      className={`bracket-match ${m.status}`}
                                      key={m.id}
                                      onClick={() => setSelected(m.id)}
                                    >
                                      <div className="bracket-match-meta">
                                        <span>{m.label}</span>
                                        <Status match={m} />
                                      </div>
                                      {["a", "b"].map((side) => (
                                        <div
                                          className={
                                            m.winner && m.winner === m[side]
                                              ? "winner"
                                              : ""
                                          }
                                          key={side}
                                        >
                                          <span>
                                            {m[side]
                                              ? name(m[side])
                                              : m[`${side}Source`]
                                                ? `Winner · ${m[`${side}Source`]}`
                                                : "Bye"}
                                          </span>
                                          <strong>
                                            {m[side]
                                              ? m[
                                                  side === "a"
                                                    ? "scoreA"
                                                    : "scoreB"
                                                ]
                                              : "—"}
                                          </strong>
                                        </div>
                                      ))}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bracket-empty">
                          <span className="bracket-empty-icon">
                            <GitBranch size={30} />
                          </span>
                          <h4>The next chapter is taking shape.</h4>
                          <p>
                            {admin
                              ? "Finish the league, resolve qualifying ties, then tap Auto draw."
                              : "Knockout fixtures will appear once the league results are in."}
                          </p>
                          <div className="progress-track">
                            <span
                              style={{
                                width: `${(done / league.length) * 100}%`,
                              }}
                            />
                          </div>
                          <small>
                            LEAGUE PROGRESS ·{" "}
                            {Math.round((done / league.length) * 100)}%
                          </small>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
        <footer>
          <div>
            <Shuttle />
            <span>
              VYŪHA <b>2026</b>
              <small>DJSCE TRINITY · BADMINTON</small>
            </span>
          </div>
          <span>Made for the love of the game.</span>
          <button className="text-btn" onClick={() => setDialog("rules")}>
            Scoring rules <ArrowUpRight size={13} />
          </button>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="Mobile tournament views">
        {TABS.map(([id, text, Icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => navigate(id)}
          >
            <Icon size={21} />
            <span>{text}</span>
            {id === "live" && counts.live > 0 && <i />}
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{toast}</span>
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {dialog === "login" && (
        <Modal
          title="Welcome, courtside."
          subtitle="Enter the admin password to manage and score matches."
          onClose={modalClose}
        >
          <form onSubmit={login} className="login-form">
            <div className="login-symbol">
              <LockKeyhole size={28} />
            </div>
            <label>
              Admin password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                placeholder="Enter your password"
                maxLength={512}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ShieldCheck size={17} />
              )}
              Unlock admin
            </button>
            <p>No account needed. Just the tournament password.</p>
          </form>
        </Modal>
      )}
      {dialog === "rules" && (
        <Modal
          title="One rally. One point."
          subtitle="VYŪHA tournament scoring rules"
          onClose={modalClose}
        >
          <div className="rules-content">
            <div className="rule-big">
              <strong>15</strong>
              <span>
                POINTS TO WIN
                <br />
                <small>One game per match, including finals.</small>
              </span>
            </div>
            <ul>
              <li>Every rally awards one point.</li>
              <li>At 14–14, win by two points.</li>
              <li>18 is the cap. At 17–17, the next point wins.</li>
              <li>
                A forfeit awards a win at {state?.settings.forfeitPoints ?? 5}
                –0. A knockout bye advances the winner without adding points.
              </li>
              <li>
                Groups rank by wins, then point difference, then head-to-head
                for a two-way tie. Admins resolve remaining ties.
              </li>
            </ul>
            <p className="fixture-note">
              League fixtures follow a cycle format: each player or pair has two
              scheduled group matches.
            </p>
          </div>
        </Modal>
      )}
      {dialog === "settings" && admin && state && (
        <Modal
          title="Tournament settings"
          subtitle="Qualification counts, awarded points and match history."
          onClose={modalClose}
          wide
        >
          <SettingsPanel
            state={state}
            busy={busy}
            act={act}
            notify={setToast}
          />
        </Modal>
      )}
      {dialog?.type === "tie" && admin && (
        <Modal
          title={`Group ${dialog.group} · Tie order`}
          subtitle={`${CATEGORIES[dialog.category]} · Used only after wins, difference and head-to-head.`}
          onClose={modalClose}
        >
          <TiePanel
            state={state}
            category={dialog.category}
            group={dialog.group}
            busy={busy}
            act={act}
            close={modalClose}
          />
        </Modal>
      )}
      {dialog?.type === "remove" && admin && (
        <Modal
          title="Reset this knockout draw?"
          subtitle={CATEGORIES[dialog.category]}
          onClose={modalClose}
        >
          <div className="confirm-content">
            <p>
              This removes the unstarted knockout fixtures. League results stay
              intact. You can change qualification counts and draw again.
            </p>
            <p>
              A draw with any played or live knockout match cannot be reset.
            </p>
            <button
              disabled={busy}
              className="danger"
              onClick={async () => {
                if (
                  await act({ type: "removeDraw", category: dialog.category })
                )
                  setDialog(null);
              }}
            >
              Reset draw
            </button>
          </div>
        </Modal>
      )}
      {selectedMatch && (
        <Modal
          title={selectedMatch.label}
          subtitle={`${CATEGORIES[selectedMatch.category]} · ${selectedMatch.stage === "league" ? `Group ${selectedMatch.group}` : "Knockout"} · ${selectedMatch.court ? `Court ${selectedMatch.court}` : "Court TBD"}`}
          onClose={modalClose}
        >
          <Scorer
            match={selectedMatch}
            name={name}
            entrant={entrant}
            admin={admin}
            busy={busy}
            online={online}
            now={now}
            act={act}
            state={state}
            notify={setToast}
          />
        </Modal>
      )}
    </>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <Shuttle />
      <p>{text}</p>
    </div>
  );
}
function MatchRow({ match: m, name, onClick }) {
  return (
    <button className={`match-row ${m.status}`} onClick={onClick}>
      <span className="match-time">
        <Clock3 size={13} />
        <span>{m.time}</span>
        <small>{m.court ? `Court ${m.court}` : "Court TBD"}</small>
      </span>
      <span className="match-row-category">
        <b>{m.category}</b>
        <small>{m.stage === "league" ? `Group ${m.group}` : "Knockout"}</small>
      </span>
      <span className="match-opponents">
        <span className={m.winner === m.a ? "winner" : ""}>{name(m.a)}</span>
        <small>vs</small>
        <span className={m.winner === m.b ? "winner" : ""}>{name(m.b)}</span>
      </span>
      <span className="match-row-end">
        {m.status !== "scheduled" && (
          <strong>
            {m.scoreA}
            <small>–</small>
            {m.scoreB}
          </strong>
        )}
        <Status match={m} />
      </span>
      <ChevronRight size={17} className="row-arrow" />
    </button>
  );
}

function Scorer({
  match: m,
  name,
  entrant,
  admin,
  busy,
  online,
  now,
  act,
  state,
  notify,
}) {
  const [advanced, setAdvanced] = useState(false),
    [confirm, setConfirm] = useState(null),
    [edit, setEdit] = useState(false);
  const mine = m.lock?.mine && m.lock.expiresAt > now,
    other = m.lock && !mine && m.lock.expiresAt > now,
    winning = scoreWinner(m.scoreA, m.scoreB);
  const disabled = busy || !online;
  const action = (type) => act({ type, matchId: m.id });
  return (
    <div className="scorer">
      <div className="scorer-meta">
        <Status match={m} />
        <span>
          <Clock3 size={13} />
          {m.time}
        </span>
      </div>
      {m.status === "finished" && (
        <div className="winner-banner">
          <Trophy size={18} />
          <span>
            {name(m.winner)}{" "}
            <b>{m.result === "bye" ? "advances by bye" : "wins"}</b>
          </span>
        </div>
      )}
      <div className="scoring-board">
        {["a", "b"].map((side) => (
          <div
            className={`scoring-side ${m.winner === m[side] ? "is-winner" : ""}`}
            key={side}
          >
            <span className="scoring-side-label">
              {side === "a" ? "SIDE A" : "SIDE B"}
            </span>
            <div className="scorer-name">
              {entrant(m[side])?.players.map((n, i) => (
                <span key={i}>{n}</span>
              )) || "To be decided"}
            </div>
            <strong className="giant-score" aria-live="polite">
              {m[side === "a" ? "scoreA" : "scoreB"]}
            </strong>
            {admin && mine && m.status === "live" && (
              <div className="score-controls">
                <button
                  className="minus"
                  aria-label={`Remove point from ${name(m[side])}`}
                  disabled={
                    disabled || m[side === "a" ? "scoreA" : "scoreB"] === 0
                  }
                  onClick={() =>
                    act({
                      type: "score",
                      matchId: m.id,
                      side,
                      delta: -1,
                      version: m.version,
                    })
                  }
                >
                  <Minus size={24} />
                </button>
                <button
                  className="plus"
                  aria-label={`Add point to ${name(m[side])}`}
                  disabled={disabled || !!winning}
                  onClick={() =>
                    act({
                      type: "score",
                      matchId: m.id,
                      side,
                      delta: 1,
                      version: m.version,
                    })
                  }
                >
                  <Plus size={29} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="score-rule">
        <span>FIRST TO 15</span>
        <span>WIN BY 2</span>
        <span>CAP AT 18</span>
      </div>
      {admin ? (
        <div className="scorer-actions">
          {other ? (
            <div className="lock-notice">
              <LockKeyhole size={20} />
              <div>
                <strong>Scoring on another device</strong>
                <p>
                  This match is in progress. Updates appear here automatically.
                  If that device disconnects, scoring can be resumed after its
                  lock expires.
                </p>
              </div>
            </div>
          ) : m.status === "scheduled" ? (
            <button
              className="primary full"
              disabled={disabled || !m.a || !m.b}
              onClick={() => action("start")}
            >
              <Play size={17} />
              Start match
            </button>
          ) : m.status === "live" && !mine ? (
            <button
              className="primary full"
              disabled={disabled}
              onClick={() => action("claim")}
            >
              <LockKeyhole size={16} />
              Resume scoring on this device
            </button>
          ) : m.status === "live" ? (
            <>
              <div className="scoring-hint">
                <ShieldCheck size={14} />
                <span>
                  Locked to this device · Every tap saves automatically
                </span>
              </div>
              {winning && (
                <p className="winning-hint">
                  Winning score reached. Confirm the result below.
                </p>
              )}
              <button
                className="primary full"
                disabled={disabled || !winning}
                onClick={() => setConfirm("finish")}
              >
                <Flag size={17} />
                Finish match
              </button>
            </>
          ) : null}
          {m.status === "finished" && (
            <p className="result-note">
              Result confirmed
              {m.result === "forfeit"
                ? ` · Forfeit (${m.scoreA}–${m.scoreB})`
                : m.result === "bye"
                  ? " · Bye (no scoring points)"
                  : ""}
              . Standings and knockout progression are updated.
            </p>
          )}
          <button
            className="advanced-toggle"
            onClick={() => setAdvanced(!advanced)}
          >
            <Settings2 size={15} />
            More match options
            <ChevronDown
              size={15}
              style={{ transform: advanced ? "rotate(180deg)" : undefined }}
            />
          </button>
          {advanced && (
            <div className="advanced-panel">
              {m.status !== "finished" && (
                <>
                  <h4>Bye / forfeit</h4>
                  <p>
                    A forfeit awards {state.settings.forfeitPoints}–0. Choose
                    the <b>winning side</b>.
                  </p>
                  {["a", "b"]
                    .filter((side) => m[side])
                    .map((side) => (
                      <div className="award-row" key={side}>
                        <span>{name(m[side])}</span>
                        <button
                          className="secondary small"
                          disabled={disabled || !!other}
                          onClick={() =>
                            setConfirm({ result: "forfeit", side })
                          }
                        >
                          Award win
                        </button>
                        {m.stage === "knockout" && (
                          <button
                            className="secondary small"
                            disabled={disabled || !!other}
                            onClick={() => setConfirm({ result: "bye", side })}
                          >
                            Bye
                          </button>
                        )}
                      </div>
                    ))}
                </>
              )}
              {m.stage === "knockout" && m.status === "scheduled" && (
                <button
                  className="secondary full"
                  onClick={() => setEdit(!edit)}
                >
                  <CalendarDays size={15} />
                  Edit knockout fixture
                </button>
              )}
              {edit && (
                <FixtureEditor
                  match={m}
                  state={state}
                  busy={busy}
                  act={act}
                  onDone={() => setEdit(false)}
                />
              )}
              <h4>Result correction</h4>
              <p>
                League results require the unstarted draw to be reset first.
                Knockout results can be reopened until a downstream match
                starts; affected unstarted slots are cleared automatically.
              </p>
              <button
                className="secondary full"
                disabled={disabled || m.status !== "finished"}
                onClick={() => setConfirm("reopen")}
              >
                Reopen result for correction
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="public-score-note">
          <Wifi size={15} />
          <span>Follow every point. This view updates automatically.</span>
        </div>
      )}
      {confirm && (
        <div className="inline-confirm">
          <strong>
            {confirm === "finish"
              ? "Confirm final score?"
              : confirm === "reopen"
                ? "Reopen this result?"
                : `Award ${confirm.result === "bye" ? "a bye" : "a forfeit win"} to ${name(m[confirm.side])}?`}
          </strong>
          <p>
            {confirm === "finish"
              ? `${name(m.a)} ${m.scoreA} – ${m.scoreB} ${name(m.b)}`
              : confirm === "reopen"
                ? "The result will be removed from standings until finished again."
                : confirm.result === "bye"
                  ? "The winner advances without scoring points."
                  : `The result will be recorded as ${state.settings.forfeitPoints}–0 to the winner.`}
          </p>
          <div>
            <button className="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={disabled}
              onClick={async () => {
                const ok = await act({
                  type: typeof confirm === "string" ? confirm : "award",
                  matchId: m.id,
                  ...(typeof confirm === "object" ? confirm : {}),
                });
                if (ok) {
                  setConfirm(null);
                  notify("Match updated.");
                }
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function FixtureEditor({ match: m, state, busy, act, onDone }) {
  const [a, setA] = useState(m.a || ""),
    [b, setB] = useState(m.b || ""),
    [court, setCourt] = useState(m.court || 1),
    [time, setTime] = useState(m.time === "To be scheduled" ? "" : m.time);
  const options = state.entrants.filter((e) => e.category === m.category);
  return (
    <form
      className="fixture-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act({
            type: "editFixture",
            matchId: m.id,
            a,
            b,
            court: Number(court),
            time,
          })
        )
          onDone();
      }}
    >
      <label>
        Side A
        <select value={a} onChange={(e) => setA(e.target.value)} required>
          <option value="">Choose opponent</option>
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {label(e)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Side B
        <select value={b} onChange={(e) => setB(e.target.value)} required>
          <option value="">Choose opponent</option>
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {label(e)}
            </option>
          ))}
        </select>
      </label>
      <div className="form-two">
        <label>
          Court
          <select value={court} onChange={(e) => setCourt(e.target.value)}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                Court {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Time
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="e.g. 4:20–4:40 PM"
            maxLength={80}
            required
          />
        </label>
      </div>
      <p>
        Players and partnerships stay fixed. Opponents already in this round
        will swap places automatically.
      </p>
      <button className="primary full" disabled={busy}>
        Update fixture
      </button>
    </form>
  );
}
function SettingsPanel({ state, busy, act, notify }) {
  const [q, setQ] = useState(structuredClone(state.settings.qualifications)),
    [points, setPoints] = useState(state.settings.forfeitPoints),
    [audit, setAudit] = useState(null);
  return (
    <div className="settings-panel">
      <section>
        <h3>Qualification places</h3>
        <p>
          Choose how many advance from each group. This defines the size of the
          automatic knockout draw; empty bracket slots become byes.
        </p>
        {Object.entries(CATEGORIES).map(([cat, text]) => {
          const drawn = state.matches.some(
            (m) => m.category === cat && m.stage === "knockout",
          );
          return (
            <div className="qualification-category" key={cat}>
              <div>
                <strong>{text}</strong>
                {drawn && <small>Reset the unstarted draw to change</small>}
              </div>
              <div>
                {Object.entries(q[cat]).map(([group, n]) => (
                  <label key={group}>
                    Group {group}
                    <input
                      type="number"
                      min="0"
                      max={
                        state.entrants.filter(
                          (e) => e.category === cat && e.group === group,
                        ).length
                      }
                      value={n}
                      disabled={drawn || busy}
                      onChange={(e) =>
                        setQ({
                          ...q,
                          [cat]: { ...q[cat], [group]: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            const changed = Object.fromEntries(
              Object.entries(q).filter(
                ([cat, g]) =>
                  JSON.stringify(g) !==
                  JSON.stringify(state.settings.qualifications[cat]),
              ),
            );
            if (!Object.keys(changed).length)
              return notify("Qualification settings are already up to date.");
            if (await act({ type: "settings", qualifications: changed }))
              notify("Qualification counts saved.");
          }}
        >
          <Check size={16} />
          Save qualification counts
        </button>
      </section>
      <section>
        <h3>Forfeit points</h3>
        <p>
          Default award is 5–0. Changes apply to future forfeits; existing
          results stay as recorded.
        </p>
        <div className="forfeit-setting">
          <label>
            Points awarded to the winner
            <input
              type="number"
              min="1"
              max="18"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </label>
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              if (await act({ type: "settings", forfeitPoints: points }))
                notify("Forfeit award saved.");
            }}
          >
            Save award
          </button>
        </div>
      </section>
      <section>
        <h3>Tournament records</h3>
        <p>
          Download the current public scores and settings, or review recent
          admin actions.
        </p>
        <div className="record-actions">
          <button
            className="secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(state, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "vyuha-tournament-snapshot.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={15} />
            Export snapshot
          </button>
          <button
            className="secondary"
            onClick={async () => {
              try {
                const r = await fetch("/api/audit"),
                  d = await r.json();
                if (!r.ok) throw new Error(d.error);
                setAudit(d.audit);
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            View activity
          </button>
        </div>
        {audit && (
          <div className="audit-list">
            {audit.length ? (
              audit.slice(0, 50).map((a, i) => (
                <div key={i}>
                  <strong>
                    {a.action} <span>{a.matchId}</span>
                  </strong>
                  <small>
                    {new Date(a.at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    · device {a.device}
                    {a.score ? ` · ${a.score.join("–")}` : ""}
                  </small>
                </div>
              ))
            ) : (
              <p>No actions yet.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
function TiePanel({ state, category, group, busy, act, close }) {
  const [ids, setIds] = useState(
    standings(state, category, group).map((r) => r.id),
  );
  const move = (i, delta) => {
    const next = [...ids];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    setIds(next);
  };
  return (
    <div className="tie-panel">
      <p>
        Move tied participants into the order decided by the organizer. This
        never overrides wins, point difference, or a decisive head-to-head
        result.
      </p>
      <div>
        {ids.map((id, i) => (
          <div className="tie-order-row" key={id}>
            <b>{i + 1}</b>
            <span>{label(state.entrants.find((e) => e.id === id))}</span>
            <button
              className="icon-btn"
              aria-label={`Move ${label(state.entrants.find((e) => e.id === id))} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={16} />
            </button>
            <button
              className="icon-btn"
              aria-label={`Move ${label(state.entrants.find((e) => e.id === id))} down`}
              disabled={i === ids.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="primary full"
        disabled={busy}
        onClick={async () => {
          if (
            await act({
              type: "settings",
              tieOrders: { [`${category}-${group}`]: ids },
            })
          )
            close();
        }}
      >
        Save tie order
      </button>
    </div>
  );
}
