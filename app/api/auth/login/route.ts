import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = route(async (req: Request) => {
  const { email, password } = await readJson(req, Body.parse);
  const db = await getDb();
  const [doctor] = await db.select().from(schema.doctors).where(eq(schema.doctors.email, email.toLowerCase()));
  if (!doctor || !(await bcrypt.compare(password, doctor.passwordHash))) {
    throw new ApiError(401, "Wrong email or password");
  }
  const token = await createSessionToken({ doctorId: doctor.id, name: doctor.name });
  const res = NextResponse.json({ ok: true, name: doctor.name });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
