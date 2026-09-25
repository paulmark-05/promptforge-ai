import { NextResponse } from "next/server";
import { analyzePrompt } from "../../../lib/analyzer";
import { chat, getConfig, parseJson } from "../../../lib/llm";
import { CRITIC_SYSTEM, wrapPrompt } from "../../../lib/prompts";
import { handle, readText, userKey } from "../../../lib/api";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt");
  const analysis = analyzePrompt(prompt);

  const cfg = getConfig(userKey(req));
  let critique = null;
  let warning: string | undefined;
  if (body.ai !== false && cfg) {
    try {
      const r = await chat(
        cfg,
        [
          { role: "system", content: CRITIC_SYSTEM },
          { role: "user", content: wrapPrompt(prompt) },
        ],
        { temperature: 0.2, json: true, maxTokens: 1500 },
      );
      critique = parseJson(r.text);
    } catch (e) {
      warning = `AI critique unavailable: ${e instanceof Error ? e.message : e}`;
    }
  }
  return NextResponse.json({ analysis, critique, warning });
});
