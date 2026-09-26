// LLM-as-judge helpers shared by the API routes and the benchmark.

import { chat, parseJson, type LlmConfig } from "./llm.ts";
import { PAIRWISE_SYSTEM } from "./prompts.ts";

export const CRITERIA = ["relevance", "completeness", "accuracy", "clarity", "conciseness", "instruction_following"] as const;

export interface JudgeScore {
  scores: Record<string, number>;
  overall: number; // 0..100
  feedback: string;
}

export interface PairwiseResult {
  original: JudgeScore;
  optimized: JudgeScore;
  winner: "original" | "optimized" | "tie";
  reason: string;
  shownFirst: "original" | "optimized"; // recorded so position bias can be audited
}

// Long answers are cut for judging so one comparison fits the free-tier
// tokens-per-minute budget. 9,000 characters is roughly 1,500 words.
const MAX_JUDGED_CHARS = 9000;

export function toJudgeScore(raw: { scores?: Record<string, unknown>; feedback?: string } | undefined): JudgeScore {
  const scores = Object.fromEntries(CRITERIA.map((c) => [c, clampScore(raw?.scores?.[c])])) as Record<string, number>;
  const overall = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / CRITERIA.length) * 10);
  // Answers are shown in shuffled order, so positional labels would confuse the reader.
  const feedback = (raw?.feedback ?? "")
    .replace(/\b(than|to|with) (the )?((first|second) answer|answer[ _]?[12])\b/gi, "$1 the other answer")
    .replace(/\b(the )?(first|second) answer\b|\banswer[ _]?[12]\b/gi, "this answer")
    .replace(/^this/, "This");
  return { scores, overall, feedback };
}

export async function pairwiseJudge(
  cfg: LlmConfig,
  intent: string,
  originalAnswer: string,
  optimizedAnswer: string,
  opts: { swap?: boolean; retries?: number; maxWaitMs?: number } = {},
): Promise<PairwiseResult> {
  const swap = opts.swap ?? Math.random() < 0.5;
  const [first, second] = swap ? [optimizedAnswer, originalAnswer] : [originalAnswer, optimizedAnswer];
  const r = await chat(
    cfg,
    [
      { role: "system", content: PAIRWISE_SYSTEM },
      {
        role: "user",
        content: `<request>\n${intent}\n</request>\n\n<answer_1>\n${clip(first)}\n</answer_1>\n\n<answer_2>\n${clip(second)}\n</answer_2>`,
      },
    ],
    { temperature: 0, json: true, maxTokens: 1500, retries: opts.retries, maxWaitMs: opts.maxWaitMs },
  );
  const j = parseJson<{
    answer_1?: { scores?: Record<string, unknown>; feedback?: string };
    answer_2?: { scores?: Record<string, unknown>; feedback?: string };
    winner?: string;
    reason?: string;
  }>(r.text);
  const a1 = toJudgeScore(j.answer_1);
  const a2 = toJudgeScore(j.answer_2);
  const firstIs = swap ? "optimized" : "original";
  const secondIs = swap ? "original" : "optimized";
  const winner = j.winner === "answer_1" ? firstIs : j.winner === "answer_2" ? secondIs : "tie";
  return {
    original: swap ? a2 : a1,
    optimized: swap ? a1 : a2,
    winner,
    reason: nameAnswers(j.reason ?? "", firstIs, secondIs),
    shownFirst: firstIs,
  };
}

export interface CombinedVerdict extends Omit<PairwiseResult, "shownFirst"> {
  consistent: boolean; // both judging orders point the same way
  modelPicks: [PairwiseResult["winner"], PairwiseResult["winner"]]; // the judge's free-choice picks, kept for auditing
}

// Scores closer than this (on the 0-100 scale) are treated as a tie.
export const TIE_BAND = 2;

function byScore(original: number, optimized: number): PairwiseResult["winner"] {
  const diff = optimized - original;
  return diff >= TIE_BAND ? "optimized" : diff <= -TIE_BAND ? "original" : "tie";
}

// Three known judge problems are handled here:
// 1. Position bias: judges favour the answer they read first, so each pair is
//    judged in both orders and the scores are averaged.
// 2. Verdict drift: the judge's free-choice "winner" tends to favour the longer
//    answer even when its own criterion scores say otherwise, so the winner is
//    decided from the averaged criterion scores instead.
export function combineVerdicts(a: PairwiseResult, b: PairwiseResult): CombinedVerdict {
  const avgScore = (x: JudgeScore, y: JudgeScore): JudgeScore => {
    const scores = Object.fromEntries(CRITERIA.map((c) => [c, (x.scores[c] + y.scores[c]) / 2])) as Record<string, number>;
    return { scores, overall: Math.round((x.overall + y.overall) / 2), feedback: x.feedback || y.feedback };
  };
  const original = avgScore(a.original, b.original);
  const optimized = avgScore(a.optimized, b.optimized);
  const consistent = byScore(a.original.overall, a.optimized.overall) === byScore(b.original.overall, b.optimized.overall);
  // 3. Noise: a winner is declared only when both orders agree on the direction.
  const winner = consistent ? byScore(original.overall, optimized.overall) : "tie";
  const reason =
    winner === "tie"
      ? consistent
        ? `Scores are within ${TIE_BAND} points, so neither answer is clearly better.`
        : "The scores changed direction when the answers were swapped, so the difference is within judging noise."
      : a.winner === winner
        ? a.reason
        : b.winner === winner
          ? b.reason
          : `The ${winner} answer scored higher on the criteria.`;
  return { original, optimized, winner, reason, consistent, modelPicks: [a.winner, b.winner] };
}

export async function judgeBothOrders(
  cfg: LlmConfig,
  intent: string,
  originalAnswer: string,
  optimizedAnswer: string,
  opts: { retries?: number; maxWaitMs?: number } = {},
) {
  const first = await pairwiseJudge(cfg, intent, originalAnswer, optimizedAnswer, { ...opts, swap: false });
  const second = await pairwiseJudge(cfg, intent, originalAnswer, optimizedAnswer, { ...opts, swap: true });
  return { combined: combineVerdicts(first, second), passes: [first, second] as const };
}

// The reason compares the two answers, so replace positional labels with the real sides.
function nameAnswers(text: string, first: string, second: string) {
  const out = text
    .replace(/\b(the )?first answer\b|\banswer[ _]?1\b/gi, `the ${first} answer`)
    .replace(/\b(the )?second answer\b|\banswer[ _]?2\b/gi, `the ${second} answer`);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function clip(text: string) {
  return text.length > MAX_JUDGED_CHARS ? `${text.slice(0, MAX_JUDGED_CHARS)}\n[answer truncated for judging]` : text;
}

function clampScore(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : 5;
}
