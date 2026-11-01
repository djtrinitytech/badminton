const REQUIRED = [
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
];
function jwtRole(key) {
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
      .role;
  } catch {
    return null;
  }
}
export function deploymentErrors(env) {
  const errors = REQUIRED.filter((name) => !env[name]?.trim()).map(
    (name) => `Missing ${name}.`,
  );
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32)
    errors.push("SESSION_SECRET must contain at least 32 characters.");
  if (env.ADMIN_PASSWORD === "local-courtside-preview")
    errors.push("Replace the local preview ADMIN_PASSWORD before deploying.");
  if (env.SUPABASE_URL) {
    try {
      const url = new URL(env.SUPABASE_URL);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error();
    } catch {
      errors.push("SUPABASE_URL must be a valid HTTPS project URL.");
    }
  }
  if (
    env.SUPABASE_SECRET_KEY &&
    !env.SUPABASE_SECRET_KEY.startsWith("sb_secret_") &&
    jwtRole(env.SUPABASE_SECRET_KEY) !== "service_role"
  )
    errors.push(
      "SUPABASE_SECRET_KEY must be a backend secret key or legacy service_role key.",
    );
  if (
    env.SUPABASE_PUBLISHABLE_KEY &&
    !env.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") &&
    jwtRole(env.SUPABASE_PUBLISHABLE_KEY) !== "anon"
  )
    errors.push(
      "SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon key.",
    );
  return errors;
}
