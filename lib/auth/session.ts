import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "carryover_session";
const SESSION_HOURS = 24;

export interface Session {
  doctorId: string;
  name: string;
}

let warned = false;
function secret() {
  let s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (!warned) {
      console.warn("[auth] AUTH_SECRET missing or < 32 chars; using an insecure dev secret");
      warned = true;
    }
    s = "carryover-insecure-dev-secret-change-me-please";
  }
  return new TextEncoder().encode(s);
}

export async function createSessionToken(session: Session) {
  return new SignJWT({ name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.doctorId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { doctorId: payload.sub, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_HOURS * 3600,
};
