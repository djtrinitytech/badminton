import test from "node:test";
import assert from "node:assert/strict";
import {
  passwordMatches,
  newSession,
  session,
  sameOrigin,
} from "../lib/auth.mjs";
process.env.ADMIN_PASSWORD = "test-password-not-production";
process.env.SESSION_SECRET =
  "test-session-secret-must-be-at-least-32-characters";
const request = (value) => ({ cookies: { get: () => ({ value }) } });
test("password-only sessions validate passwords and reject modified cookies", () => {
  assert.equal(passwordMatches("wrong"), false);
  assert.equal(passwordMatches(process.env.ADMIN_PASSWORD), true);
  const token = newSession(),
    decoded = session(request(token));
  assert.ok(decoded.sid);
  assert.ok(decoded.expires > Date.now());
  assert.equal(session(request(token.slice(0, -3) + "xxx")), null);
  assert.equal(session(request("broken")), null);
});
test("origin protection accepts browser Host behind internal bind URLs and rejects cross-origin writes", () => {
  const req = (origin, host) => ({
    url: "http://0.0.0.0:3000/api/action",
    headers: new Headers({ origin, host }),
  });
  assert.doesNotThrow(() =>
    sameOrigin(req("http://localhost:3000", "localhost:3000")),
  );
  assert.doesNotThrow(() =>
    sameOrigin(req("https://tournament.example", "tournament.example")),
  );
  assert.throws(
    () => sameOrigin(req("https://bad.example", "tournament.example")),
    /origin/,
  );
  assert.throws(() => sameOrigin(req("null", "tournament.example")), /origin/);
});
