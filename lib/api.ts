import { NextResponse } from "next/server";
import { hasIntent, type Intent } from "./intent.ts";
import { LlmError } from "./llm.ts";

export const MAX_PROMPT_CHARS = 6000;

export class InputError extends Error {}

export function userKey(req: Request) {
  return req.headers.get("x-user-api-key");
}

export function bad(message: string, status = 400, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// For routes that fall back instead of failing: tells the client the text-AI
// key ran out (or was rejected), so it can offer "Add your own key".
export function limitOf(e: unknown): "text" | undefined {
  return e instanceof LlmError && (e.code === "quota" || e.code === "auth") ? "text" : undefined;
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
      if (e instanceof LlmError) return bad(e.message, e.status === 401 || e.status === 429 ? e.status : 502, { code: e.code, service: "text" });
      console.error(e);
      return bad(e instanceof Error ? e.message : "Unexpected error.", 502);
    }
  };
}

// Optional confirmed intent from the client: every field a short string.
export function readIntent(value: unknown): Intent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const pick = (k: keyof Intent) => (typeof v[k] === "string" ? (v[k] as string).slice(0, 300) : "");
  const intent: Intent = { audience: pick("audience"), goal: pick("goal"), length: pick("length"), format: pick("format"), tone: pick("tone"), notes: pick("notes") };
  return hasIntent(intent) ? intent : null;
}
