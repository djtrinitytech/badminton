import {
  COOKIE,
  passwordMatches,
  newSession,
  sameOrigin,
  clientKey,
} from "../../../lib/auth.mjs";
import { loginAttempt } from "../../../lib/store.mjs";
import { json, failure, body } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    sameOrigin(request);
    if (!(await loginAttempt(clientKey(request))))
      return json(
        { error: "Too many attempts. Try again in 15 minutes." },
        429,
      );
    const { password } = await body(request);
    if (!passwordMatches(password))
      return json({ error: "That password is incorrect." }, 401);
    const response = json({ ok: true });
    response.cookies.set(COOKIE, newSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request) {
  try {
    sameOrigin(request);
    const response = json({ ok: true });
    response.cookies.set(COOKIE, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
