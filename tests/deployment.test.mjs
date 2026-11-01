import test from "node:test";
import assert from "node:assert/strict";
import { deploymentErrors } from "../lib/deployment-config.mjs";
const valid = {
  ADMIN_PASSWORD: "a-production-password",
  SESSION_SECRET: "x".repeat(64),
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_example",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};
const jwt = (role) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
test("Vercel validation accepts modern and legacy Supabase API configurations", () => {
  assert.deepEqual(deploymentErrors(valid), []);
  assert.deepEqual(
    deploymentErrors({
      ...valid,
      SUPABASE_SECRET_KEY: jwt("service_role"),
      SUPABASE_PUBLISHABLE_KEY: jwt("anon"),
    }),
    [],
  );
});
test("Vercel validation reports missing configuration without logging values", () => {
  const errors = deploymentErrors({});
  assert.equal(errors.length, 5);
  assert.ok(errors.some((e) => e.includes("SUPABASE_SECRET_KEY")));
  const swapped = deploymentErrors({
    ...valid,
    SUPABASE_SECRET_KEY: valid.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_PUBLISHABLE_KEY: valid.SUPABASE_SECRET_KEY,
  });
  assert.equal(swapped.length, 2);
  assert.ok(
    swapped.every(
      (e) =>
        !e.includes("sb_secret_example") &&
        !e.includes("sb_publishable_example"),
    ),
  );
});
test("Vercel validation rejects preview passwords, short sessions, and non-HTTPS database URLs", () => {
  const errors = deploymentErrors({
    ...valid,
    ADMIN_PASSWORD: "local-courtside-preview",
    SESSION_SECRET: "short",
    SUPABASE_URL: "http://example.supabase.co",
  });
  assert.equal(errors.length, 3);
});
