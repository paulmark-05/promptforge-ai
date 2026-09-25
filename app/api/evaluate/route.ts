import { NextResponse } from "next/server";
import { responseMetrics } from "../../../lib/metrics";
import { chat, getConfig, parseJson } from "../../../lib/llm";
import { JUDGE_SYSTEM } from "../../../lib/prompts";
import { handle, readText, userKey } from "../../../lib/api";

const CRITERIA = ["relevance", "completeness", "accuracy", "clarity", "instruction_following"] as const;

export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt");
  const response = readText(body.response, "response", 20000);
  const metrics = responseMetrics(prompt, response);

  const cfg = getConfig(userKey(req));
  let judge = null;
  let warning: string | undefined;
  if (cfg) {
    try {
      const r = await chat(
        cfg,
        [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: `<prompt>\n${prompt}\n</prompt>\n\n<response>\n${response}\n</response>` },
        ],
        { temperature: 0, json: true, maxTokens: 700 },
      );
      const j = parseJson<{ scores?: Record<string, unknown>; feedback?: string; improvements?: string[] }>(r.text);
      const scores = Object.fromEntries(CRITERIA.map((c) => [c, clampScore(j.scores?.[c])])) as Record<string, number>;
      const overall = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / CRITERIA.length) * 10);
      judge = { scores, overall, feedback: j.feedback ?? "", improvements: j.improvements ?? [] };
    } catch (e) {
      warning = `AI judge unavailable: ${e instanceof Error ? e.message : e}`;
    }
  }
  return NextResponse.json({ metrics, judge, warning });
});

function clampScore(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : 5;
}
