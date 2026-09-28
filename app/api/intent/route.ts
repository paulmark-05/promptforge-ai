import { NextResponse } from "next/server";
import { analyzePrompt } from "../../../lib/analyzer";
import { mergeOptions, presetOptions } from "../../../lib/intent";
import { IMAGE_PRESETS } from "../../../lib/image";
import { chat, getConfig, parseJson } from "../../../lib/llm";
import { IMAGE_INTENT_SYSTEM, INTENT_SYSTEM, wrapPrompt } from "../../../lib/prompts";
import { handle, limitOf, readText, userKey } from "../../../lib/api";

export const maxDuration = 60;

// Suggests likely answers for each open need. Presets always work; with a key,
// the LLM tailors them to the prompt. kind = "image" asks about image needs.
export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt");
  const image = body.kind === "image";
  const presets = image ? IMAGE_PRESETS : presetOptions(analyzePrompt(prompt).taskType);

  const cfg = getConfig(userKey(req));
  if (!cfg) return NextResponse.json({ options: presets, mode: "offline" });
  try {
    const r = await chat(cfg, [
      { role: "system", content: image ? IMAGE_INTENT_SYSTEM : INTENT_SYSTEM },
      { role: "user", content: wrapPrompt(prompt) },
    ], { temperature: 0.3, json: true, maxTokens: 800 });
    return NextResponse.json({ options: mergeOptions(parseJson(r.text), presets, { openLength: !image }), mode: "llm" });
  } catch (e) {
    return NextResponse.json({ options: presets, mode: "offline", limit: limitOf(e) });
  }
});
