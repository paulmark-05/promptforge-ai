import { NextResponse } from "next/server";
import { chat, getConfig } from "../../../lib/llm";
import { bad, handle, readText, userKey } from "../../../lib/api";

export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt");
  const cfg = getConfig(userKey(req));
  if (!cfg) return bad("No LLM API key configured. Add one in Settings to generate responses.", 503);
  const r = await chat(
    cfg,
    [
      { role: "system", content: "You are a helpful assistant. Follow the user's instructions carefully." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.7, maxTokens: 1500 },
  );
  return NextResponse.json(r);
});
