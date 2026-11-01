import {
  createHmac,
  timingSafeEqual,
  randomUUID,
  createHash,
} from "node:crypto";
import { RuleError } from "./tournament.mjs";
export const COOKIE = "vyuha_admin";
const configured = () => {
  if (
    !process.env.ADMIN_PASSWORD ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
  )
    throw new RuleError(
      "Set ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters on the server.",
      503,
    );
};
const sign = (value) =>
  createHmac("sha256", process.env.SESSION_SECRET)
    .update(value)
    .digest("base64url");
export function passwordMatches(value) {
  configured();
  return timingSafeEqual(
    createHash("sha256").update(String(value)).digest(),
    createHash("sha256").update(process.env.ADMIN_PASSWORD).digest(),
  );
}
export function newSession() {
  configured();
  const value = Buffer.from(
    JSON.stringify({
      sid: randomUUID(),
      expires: Date.now() + 12 * 60 * 60_000,
    }),
  ).toString("base64url");
  return `${value}.${sign(value)}`;
}
export function session(request) {
  try {
    configured();
    const token = request.cookies.get(COOKIE)?.value;
    if (!token) return null;
    const [value, signature] = token.split(".");
    const expected = sign(value);
    if (
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    return data.expires > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export function requireSession(request) {
  const s = session(request);
  if (!s)
    throw new RuleError("Your admin session expired. Sign in again.", 401);
  return s;
}
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  // Next's internal request URL may use the bind address or a Vercel internal host.
  // The browser-facing Host header must still agree exactly with the Origin host.
  let allowed = false;
  try {
    allowed =
      !!origin &&
      new URL(origin).host ===
        (request.headers.get("host") || new URL(request.url).host) &&
      ["http:", "https:"].includes(new URL(origin).protocol);
  } catch {}
  if (!allowed) throw new RuleError("Request origin is not allowed.", 403);
}
export function clientKey(request) {
  return createHash("sha256")
    .update(
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local",
    )
    .digest("hex");
}
