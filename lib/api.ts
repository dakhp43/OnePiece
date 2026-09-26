import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Wraps a route handler so ApiError / ZodError become JSON error responses. */
export function route<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
      }
      console.error("[api]", err);
      return NextResponse.json({ error: (err as Error).message || "Server error" }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Body must be JSON");
  }
  return parse(body);
}
