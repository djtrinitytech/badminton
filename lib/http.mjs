import { NextResponse } from "next/server";
export function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
export function failure(error) {
  if (error.status) return json({ error: error.message }, error.status);
  console.error("Server request failed:", error.message);
  return json(
    { error: "Could not save or load tournament data. Please retry." },
    500,
  );
}
export async function body(request) {
  const raw = await request.text();
  if (raw.length > 24000)
    throw Object.assign(new Error("Request too large."), { status: 413 });
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
  }
}
