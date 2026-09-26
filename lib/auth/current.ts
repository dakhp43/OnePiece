import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For server components: redirects to /login if not signed in. */
export async function requireDoctorPage(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** For route handlers: throws 401 if not signed in. */
export async function requireDoctorApi(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "Not signed in");
  return session;
}
