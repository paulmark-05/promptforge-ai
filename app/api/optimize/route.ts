import { NextResponse } from "next/server";
import { analyzePrompt } from "../../../lib/analyzer";
import { optimizeOffline, TECHNIQUES, type TechniqueId, type OptimizeResult } from "../../../lib/optimizer";
import { chat, getConfig, parseJson } from "../../../lib/llm";
import { IMAGE_OPTIMIZER_SYSTEM, OPTIMIZER_SYSTEM, wrapPrompt } from "../../../lib/prompts";
import { analyzeImagePrompt, optimizeImageOffline } from "../../../lib/image";
import { handle, limitOf, readIntent, readText, userKey } from "../../../lib/api";
import { intentStatement } from "../../../lib/intent";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt");
  const valid = new Set<string>(TECHNIQUES.map((t) => t.id));
  const techniques: TechniqueId[] = Array.isArray(body.techniques)
    ? body.techniques.filter((t: unknown): t is TechniqueId => typeof t === "string" && valid.has(t))
    : TECHNIQUES.map((t) => t.id);

  const intent = readIntent(body.intent);
  const image = body.kind === "image";
  const scoreOf = (text: string) => (image ? analyzeImagePrompt(text) : analyzePrompt(text));
  const before = scoreOf(prompt);
  if (before.injectionRisk) {
    return NextResponse.json({
      optimizedPrompt: prompt,
      changes: [],
      rationale: "This prompt contains an instruction-override pattern, so it was not optimized. Rewrite it as a direct task.",
      mode: "offline",
      before: before.score,
      after: before.score,
    });
  }

  const cfg = getConfig(userKey(req));
  let result: OptimizeResult | null = null;
  let warning: string | undefined;
  let limit: string | undefined;
  if (cfg && body.mode !== "offline") {
    try {
      const labels = TECHNIQUES.filter((t) => techniques.includes(t.id)).map((t) => `- ${t.label}: ${t.description}`);
      const issues = before.issues.map((i) => `- ${i.message}`);
      const r = await chat(
        cfg,
        [
          { role: "system", content: image ? IMAGE_OPTIMIZER_SYSTEM : OPTIMIZER_SYSTEM },
          {
            role: "user",
            content: `${wrapPrompt(prompt)}\n\n<confirmed_needs>\n${intent ? intentStatement("", intent).replace(/^\s*What I actually need:\n/, "") : "(none confirmed)"}\n</confirmed_needs>\n\nWeaknesses found:\n${issues.join("\n") || "- none"}\n\nTechniques to apply:\n${labels.join("\n")}`,
          },
        ],
        { temperature: 0.4, json: true, maxTokens: 3000 },
      );
      const j = parseJson<{ optimized_prompt?: string; changes?: { technique: string; description: string }[]; rationale?: string }>(r.text);
      if (!j.optimized_prompt?.trim()) throw new Error("Empty optimized prompt.");
      result = { optimizedPrompt: j.optimized_prompt.trim(), changes: j.changes ?? [], rationale: j.rationale ?? "", mode: "llm" };
    } catch (e) {
      warning = `AI optimizer failed, used offline templates instead. ${e instanceof Error ? e.message : ""}`;
      limit = limitOf(e);
    }
  }
  result ??= image ? optimizeImageOffline(prompt, intent) : optimizeOffline(prompt, techniques, intent);
  const after = scoreOf(result.optimizedPrompt);
  return NextResponse.json({ ...result, before: before.score, after: after.score, warning, limit });
});
