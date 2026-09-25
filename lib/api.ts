import { NextResponse } from "next/server";

export const MAX_PROMPT_CHARS = 6000;

export class InputError extends Error {}

export function userKey(req: Request) {
  return req.headers.get("x-user-api-key");
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function readText(value: unknown, field: string, max = MAX_PROMPT_CHARS): string {
  if (typeof value !== "string" || !value.trim()) throw new InputError(`"${field}" is required.`);
  if (value.length > max) throw new InputError(`"${field}" is too long (max ${max} characters).`);
  return value;
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof InputError) return bad(e.message);
      if (e instanceof SyntaxError) return bad("Request body must be valid JSON.");
      console.error(e);
      return bad(e instanceof Error ? e.message : "Unexpected error.", 502);
    }
  };
}
