import { NextResponse } from "next/server";
import { responseMetrics } from "../../../lib/metrics";
import { chat, getConfig, parseJson } from "../../../lib/llm";
import { JUDGE_SYSTEM } from "../../../lib/prompts";
import { toJudgeScore } from "../../../lib/judge";
import { handle, limitOf, readText, userKey } from "../../../lib/api";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt");
  const response = readText(body.response, "response", 20000);
  const metrics = responseMetrics(prompt, response);

  const cfg = getConfig(userKey(req));
  let judge = null;
  let warning: string | undefined;
  let limit: string | undefined;
  if (cfg) {
    try {
      const r = await chat(
        cfg,
        [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: `<prompt>\n${prompt}\n</prompt>\n\n<response>\n${response}\n</response>` },
        ],
        { temperature: 0, json: true, maxTokens: 1500 },
      );
      const j = parseJson<{ scores?: Record<string, unknown>; feedback?: string; improvements?: string[] }>(r.text);
      judge = { ...toJudgeScore(j), improvements: j.improvements ?? [] };
    } catch (e) {
      warning = `AI judge unavailable: ${e instanceof Error ? e.message : e}`;
      limit = limitOf(e);
    }
  }
  return NextResponse.json({ metrics, judge, warning, limit });
});

