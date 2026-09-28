import { NextResponse } from "next/server";
import { analyzePrompt } from "../../../lib/analyzer";
import { mergeOptions, presetOptions } from "../../../lib/intent";
import { chat, getConfig, parseJson } from "../../../lib/llm";
import { INTENT_SYSTEM, wrapPrompt } from "../../../lib/prompts";
import { handle, readText, userKey } from "../../../lib/api";

export const maxDuration = 60;

// Suggests likely answers for each open need (audience, purpose, length, format,
// tone). Presets by task type always work; with a key, the LLM tailors them.
export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt");
  const presets = presetOptions(analyzePrompt(prompt).taskType);

  const cfg = getConfig(userKey(req));
  if (!cfg) return NextResponse.json({ options: presets, mode: "offline" });
  try {
    const r = await chat(cfg, [
      { role: "system", content: INTENT_SYSTEM },
      { role: "user", content: wrapPrompt(prompt) },
    ], { temperature: 0.3, json: true, maxTokens: 800 });
    return NextResponse.json({ options: mergeOptions(parseJson(r.text), presets), mode: "llm" });
  } catch {
    return NextResponse.json({ options: presets, mode: "offline" });
  }
});
