import { NextResponse } from "next/server";
import { responseMetrics } from "../../../lib/metrics";
import { getConfig } from "../../../lib/llm";
import { pairwiseJudge } from "../../../lib/judge";
import { bad, handle, readIntent, readText, userKey } from "../../../lib/api";
import { intentStatement } from "../../../lib/intent";

export const maxDuration = 60;

// Judges the original and optimized answers side by side, both against the
// same yardstick: the original request plus the needs the user confirmed.
// The client calls this twice with swap=false and swap=true (one judging pass
// per request keeps each call short) and combines the passes with
// combineVerdicts to cancel position bias.
export const POST = handle(async (req) => {
  const body = await req.json();
  const originalPrompt = readText(body.originalPrompt, "originalPrompt");
  readText(body.optimizedPrompt, "optimizedPrompt");
  const originalAnswer = readText(body.originalAnswer, "originalAnswer", 40000);
  const optimizedAnswer = readText(body.optimizedAnswer, "optimizedAnswer", 40000);

  const yardstick = intentStatement(originalPrompt, readIntent(body.intent));
  const cfg = getConfig(userKey(req));
  if (!cfg) return bad("No LLM API key configured. Add one in Settings to compare answers.", 503);

  const verdict = await pairwiseJudge(cfg, yardstick, originalAnswer, optimizedAnswer, { swap: body.swap === true, retries: 2, maxWaitMs: 20_000 });
  return NextResponse.json({
    ...verdict,
    // Rule-based checks: both answers against the SAME rules (your stated needs).
    metrics: {
      original: responseMetrics(yardstick, originalAnswer),
      optimized: responseMetrics(yardstick, optimizedAnswer),
    },
  });
});
