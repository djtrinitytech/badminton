# VYŪHA 2026 — Badminton

A mobile-first tournament scoreboard for DJSCE Trinity. Public courts, fixtures, standings and knockout brackets; password-only admin scoring. Built for Vercel with Next.js and the **Supabase JavaScript API + Supabase Realtime**. No Supabase Auth, usernames, Neon, Ably or direct database connection is required.

## Run locally

Requires Node.js 22.13 or newer.

1. `npm install`
2. Copy `.env.example` to `.env.local`.
3. Set `ADMIN_PASSWORD` to your chosen password. Set `SESSION_SECRET` to a random string of at least 32 characters; generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Keep `LOCAL_DEMO=true` for a local, persistent JSON store in `.data/tournament.json`. Without Supabase, local viewers synchronize every five seconds. To test the real backend, fill the three Supabase variables instead and run the SQL setup below.
5. `npm run dev`, then open [localhost:3000](http://localhost:3000). Tap **Admin** to sign in; `/?admin` also opens sign-in.

The local JSON store is deliberately disabled on Vercel and in production. Production requires Supabase. The backend secret key and admin password never reach the browser; the publishable key is intentionally public and can only read the revision notification table.

## Deploy on Vercel

1. Push this directory to a Git repository and import it into Vercel. Framework preset: **Next.js**. Build: `npm run build`. Node: **22.x or newer**.
2. Create or open a Supabase project. Run the **entire [supabase/setup.sql](supabase/setup.sql)** in Supabase → SQL Editor as `postgres`. It creates tables, private mutation RPCs, RLS rules and the Realtime publication. It is safe to rerun and preserves existing tournament results. Keep the standard `public` schema enabled in the Supabase Data API.
3. In Supabase **Project Settings → Data API**, copy the **Project URL**. In **Project Settings → API Keys**, copy a **publishable key** (`sb_publishable_...`) and create/copy a backend **secret key** (`sb_secret_...`). Legacy `anon` and `service_role` keys also work in their corresponding variables. The browser uses only the publishable/anon key. Supabase Auth can remain unused; do not create admin users there.
4. Add these environment variables in Vercel → Project → Settings → Environment Variables:

   | Variable                   | Value                                                         |
   | -------------------------- | ------------------------------------------------------------- |
   | `ADMIN_PASSWORD`           | The tournament's admin password                               |
   | `SESSION_SECRET`           | A random secret of at least 32 characters                     |
   | `SUPABASE_URL`             | Project URL, e.g. `https://your-project.supabase.co`          |
   | `SUPABASE_SECRET_KEY`      | Backend secret (`sb_secret_...`) or legacy `service_role` key |
   | `SUPABASE_PUBLISHABLE_KEY` | Publishable (`sb_publishable_...`) or legacy `anon` key       |

   Keep these exact names. Do not set `LOCAL_DEMO` on Vercel. Remove obsolete `DATABASE_URL` and `ABLY_API_KEY`; the app no longer uses them. Vercel preview deployments should use a **separate Supabase project** so preview scoring never changes tournament results. Never put the secret/service_role key in a `NEXT_PUBLIC_` variable or commit it to Git.

5. Deploy (or redeploy after changing variables). The first successful data request imports the fixed schedule via a private seed RPC, only when no tournament exists. There is no manual data insertion step and redeploying preserves results. The SQL setup must be run before this request.
6. In Vercel Deployment Protection, allow public access to the production site so spectators do not need a Vercel account. The app itself protects admin mutations with a signed, HTTP-only session cookie.
7. Test on two phones: open the public site on one, sign in and score on the other. Check that each tap broadcasts and that a second admin device cannot score the same active match.

`npm run build` produces the production build. No Supabase account/project or Vercel deployment has been created or configured remotely by this repository. You must enter your project's values and execute the SQL in your account.

## Tournament rules and imported fixtures

- One game per match, including knockout rounds and finals. First to 15, win by 2 from 14–14, capped at 18. At 17–17, the next point wins.
- Start a match, use +/− to score, then explicitly Finish Match at a valid winning score. A final score does not automatically finish the match; this leaves room for corrections.
- League fixtures are exactly the 78 fixtures in the supplied PDF, including original courts and times. Each of the 78 entrants (players or pairs) plays twice. The format is a cycle, not a round robin.
- Men's Doubles Group A Pair 2 is **Rian Bangera / Aryan Bhandari**. **Haardik Patil / Vansh Patel** remains unchanged. Partnership and roster editing are not exposed.
- The PDF has overlapping participant bookings. Times remain fixed at the user's request. The server rejects simultaneous starts sharing a court or participant; an admin can start the delayed league match when that participant/court becomes free. Differently spelled names in the PDF are preserved, so organizers should still check actual player availability.
- Default per-group qualification: MS 2, MD 1, WS 1, XD 2. Admins can change each group's number independently **before drawing that category**.
- Standings rank by wins, then point difference, then the result of a head-to-head match for a two-way tie. An unresolved tied bucket containing qualifiers must be ordered by an admin before drawing. Group stage positions are marked provisional until complete.
- Cross-group knockout seeding uses group finishing position, then wins, then point difference, then group letter for equal records across different groups. With the default mixed doubles count, this gives A1 vs B2 and B1 vs A2. Men's singles uses 1–8, 4–5, 2–7, 3–6; men's doubles uses 1–4, 2–3.
- Draws require every league match in the category to be finished. Arbitrary qualifier counts generate the next power-of-two bracket, assigning byes to top seeds as necessary. Winners advance automatically.
- Standard-sized brackets use knockout times/courts from the PDF. Extra rounds or fixtures introduced by changed qualification counts require admin scheduling. The two final rows in the PDF represent concurrent finals on different courts.
- Unstarted knockout fixtures can change opponents, court and time. Choosing an opponent already in that round swaps their slot atomically; partnerships are immutable. Played matches and started downstream rounds are protected.
- A forfeit records a win with **5–0 by default**. Change the award in Admin → Manage → Forfeit points. This affects future forfeits. Knockout byes advance the winner with no point totals or played match.
- Reset an entirely unstarted draw to change qualification counts or reopen league results. A draw containing a played or live knockout cannot be reset through the app. Individual knockout results can be reopened while their downstream matches are still unstarted; affected slots are cleared automatically. Reopening preserves the existing score for correction with +/− after starting again.

## Persistence, device locks and synchronization

The server uses `@supabase/supabase-js` over HTTPS. Supabase holds one private tournament state row plus a separate storage version that changes on **every write**, including heartbeat renewals. A private SQL RPC atomically replaces the row only when its storage version still matches. Competing writers re-read the latest state and re-run validation before retrying; this preserves exclusivity across Vercel instances. Each operation has a deduplication identifier, preventing duplicate points after a network retry. Scoring also includes a per-match version check. This is not an unsafe read-then-upsert flow.

Starting a match acquires a **90-second renewable lease** tied to the signed admin session in that browser. The device renews it every 20 seconds. Other admins can view but cannot score, finish or forfeit that match while the lease is active. After the first device disconnects or its browser suspends, wait up to 90 seconds, then tap **Resume scoring on this device**. Tabs sharing the same browser cookie count as one device. Logging out does not forcibly terminate an active match; the lock expires naturally. Admin sessions last 12 hours.

Each tap commits through the Supabase API. The same SQL transaction updates `vyuha_updates`, a public read-only table containing only a revision counter and timestamp. Browsers subscribe to Postgres Changes on that table through Supabase Realtime, then refetch sanitized scores from the app immediately. Heartbeats do not emit score notifications. No scores, audit entries, operation IDs or device owners are exposed by the Supabase public API. A five-second background sync recovers missed events and is the fallback when Realtime is disconnected. The UI distinguishes saved, saving, failed and disconnected states. Network failures offer a safe retry with the same operation ID. Offline points are not silently queued.

Mutations use same-origin checks and HTTP-only, SameSite=Strict, Secure-in-production signed cookies. Login attempts are rate-limited atomically through a private Supabase RPC. No public endpoint accepts score mutations without the admin session. SQL grants RPC execution only to `service_role`, with RLS and no public access on the state and login-attempt tables. Audit history (latest 500 non-heartbeat actions) is admin-only; idempotency history retains the latest 3,000 actions. Changing `SESSION_SECRET` invalidates existing sessions; change it when rotating the password if immediate sign-out is required.

Use the snapshot export for a human-readable current record; retain Supabase database backups for recovery. Snapshots are not an automatic database restore mechanism. If migrating an existing separate Neon database, its scores are not copied automatically; the new Supabase project seeds a fresh schedule unless data has already been migrated into `vyuha_state`.

## Validation

- `npm test` — scoring boundaries, lease exclusivity, duplicate requests, fixture invariants, qualification, draws, byes, atomic reseeding, standings and privacy.
- `npm run test:api` — optional localhost-only integration checks. Set `TEST_ADMIN_PASSWORD`, use a fresh disposable `LOCAL_DEMO` store, and stop any active scoring first. This test modifies the MS A6 fixture, then reopens it; reset the disposable store afterwards. Never run against tournament data.
- `npm run build` — production compilation and route generation.

`data/schedule.json` is the checked-in source roster and league fixture import. `scripts/import-schedule.py` records the one-time import process and needs Python + pdfplumber + the original PDF only if regenerating that JSON. None of those are required for running or deploying the website.
