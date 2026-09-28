// Builds the downloadable session report: a self-contained, printable HTML
// document (Save as PDF from the browser) plus the same data as JSON.

import { lessonFor, type Lesson } from "./lessons.ts";
import { estimateTokens, imageSnippet, textSnippet } from "./snippets.ts";

export interface ReportSide {
  overall: number;
  scores: Record<string, number>;
  feedback: string;
  words: number;
  tokens?: number;
  latencyMs?: number;
  checks: { label: string; passed: boolean; detail: string }[];
  answer: string;
}

export interface ReportData {
  kind: "text" | "image";
  audience: string;
  createdAt: string;
  model: string;
  live: boolean;
  prompt: string;
  analysis: {
    score: number;
    grade: string;
    taskType: string;
    wordCount: number;
    dimensions: { key: string; label: string; weight: number; score: number; note: string }[];
    issues: { severity: string; technique: string; message: string; suggestion: string }[];
  };
  needs: { label: string; value: string }[];
  optimized?: { prompt: string; before: number; after: number; changes: { technique: string; description: string }[]; rationale: string; mode: string };
  comparison?: { winner: string; reason: string; consistent: boolean; judgedAgainst: string; original: ReportSide; optimized: ReportSide };
  images?: { originalUrl: string; optimizedUrl: string; seed: number; shape: string };
}

const CRITERIA: Record<string, string> = {
  relevance: "Relevance",
  completeness: "Completeness",
  accuracy: "Accuracy",
  clarity: "Clarity",
  conciseness: "Conciseness",
  instruction_following: "Instruction following",
};

export function reportFileName(d: ReportData, ext: "html" | "json") {
  const slug = d.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "prompt";
  return `promptforge-${slug}-${d.createdAt.slice(0, 10)}.${ext}`;
}

export function buildReportHtml(d: ReportData): string {
  const e = esc;
  const verdictText = !d.comparison
    ? ""
    : d.comparison.winner === "optimized"
      ? "The optimized prompt produced the better answer."
      : d.comparison.winner === "original"
        ? "The original prompt produced the better answer."
        : "No clear quality difference between the two answers.";
  const o = d.comparison?.original;
  const n = d.comparison?.optimized;
  const tokenSaving = o?.tokens && n?.tokens ? Math.round((1 - n.tokens / o.tokens) * 100) : null;
  const usedTechniques = unique([...(d.optimized?.changes.map((c) => c.technique) ?? []), ...d.analysis.issues.map((i) => i.technique)]);
  const lessons = usedTechniques.map((t) => [t, lessonFor(t)] as const).filter((x): x is readonly [string, Lesson] => Boolean(x[1]));
  const finalPrompt = d.optimized?.prompt ?? d.prompt;
  const snippet = d.kind === "image" && d.images ? imageSnippet("python", finalPrompt, d.images.shape, d.images.seed) : textSnippet("python", finalPrompt, d.model || undefined);
  let section = 0;
  const h2 = (title: string) => `<h2><span>${String(++section).padStart(2, "0")}</span>${e(title)}</h2>`;

  const kpis = [
    kpi("Prompt score", `${d.analysis.score}${d.optimized ? ` → ${d.optimized.after}` : ""}`, d.optimized ? `+${d.optimized.after - d.optimized.before} after rewrite` : `Grade ${d.analysis.grade}`),
    d.comparison ? kpi("Answer score", `${o!.overall} → ${n!.overall}`, `Judged against ${d.comparison.judgedAgainst}`) : "",
    d.comparison && tokenSaving != null ? kpi("Output tokens", `${o!.tokens} → ${n!.tokens}`, `${Math.abs(tokenSaving)}% ${tokenSaving >= 0 ? "fewer" : "more"}`) : "",
    d.comparison ? kpi("Answer length", `${o!.words} → ${n!.words} words`, o!.latencyMs && n!.latencyMs ? `${(o!.latencyMs / 1000).toFixed(1)}s → ${(n!.latencyMs / 1000).toFixed(1)}s` : "") : "",
    d.images ? kpi("Images", "2 rendered", `Same seed (${d.images.seed}), shape ${e(d.images.shape)}`) : "",
    kpi("Needs stated", String(d.needs.length), d.needs.length ? "Used as the target" : "Left open"),
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PromptForge report: ${e(d.prompt.slice(0, 60))}</title>
<style>
  :root { --ink:#1c1b19; --muted:#6b6760; --line:#e6e1d8; --soft:#f7f3ee; --accent:#e0561b; --accent-soft:#fdeee6; --good:#1f8a4c; --warn:#b7791f; --bad:#c2362f; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: var(--ink); font: 14px/1.6 "Segoe UI", system-ui, -apple-system, Arial, sans-serif; }
  .page { max-width: 880px; margin: 0 auto; padding: 48px 40px 64px; }
  header.cover { border-bottom: 3px solid var(--accent); padding-bottom: 24px; margin-bottom: 28px; }
  .brand { font-weight: 700; color: var(--accent); letter-spacing: .04em; font-size: 12px; text-transform: uppercase; }
  h1 { font-size: 28px; margin: 8px 0 6px; letter-spacing: -.02em; }
  .meta { color: var(--muted); font-size: 12.5px; }
  h2 { font-size: 18px; margin: 36px 0 12px; display: flex; gap: 10px; align-items: baseline; break-after: avoid; }
  h2 span { color: var(--accent); font: 600 13px ui-monospace, Consolas, monospace; }
  h3 { font-size: 14px; margin: 18px 0 6px; }
  p { margin: 6px 0; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
  .kpi { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--soft); break-inside: avoid; }
  .kpi .l { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .kpi .v { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .kpi .s { font-size: 12px; color: var(--muted); }
  .verdict { border-left: 4px solid var(--accent); background: var(--accent-soft); padding: 10px 14px; border-radius: 0 10px 10px 0; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; font-size: 13px; break-inside: avoid; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: var(--soft); font-weight: 600; font-size: 12px; }
  .bar { height: 8px; background: #efe9e1; border-radius: 99px; overflow: hidden; min-width: 120px; }
  .bar i { display: block; height: 100%; border-radius: 99px; }
  .sev { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
  .sev.high { background: #fbe3e1; color: var(--bad); } .sev.medium { background: #fcf0d9; color: var(--warn); } .sev.low { background: #eee; color: var(--muted); }
  pre { background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; white-space: pre-wrap; word-break: break-word; font: 12.5px/1.55 ui-monospace, Consolas, monospace; margin: 6px 0; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .two img { width: 100%; border-radius: 10px; border: 1px solid var(--line); }
  .cap { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .lesson { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 10px 0; break-inside: avoid; }
  .lesson b { color: var(--accent); }
  .ok { color: var(--good); font-weight: 600; } .no { color: var(--bad); font-weight: 600; }
  footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
  .print { position: fixed; right: 20px; bottom: 20px; background: var(--accent); color: #fff; border: 0; border-radius: 99px; padding: 10px 18px; font-weight: 600; cursor: pointer; }
  @media print { .print { display: none; } .page { padding: 0; } a { color: inherit; } }
  @media (max-width: 640px) { .kpis, .two { grid-template-columns: 1fr; } .page { padding: 24px 16px; } }
</style></head>
<body><div class="page">
<button class="print" onclick="window.print()">Save as PDF</button>
<header class="cover">
  <div class="brand">PromptForge AI · Prompt report</div>
  <h1>${e(d.kind === "image" ? "Image prompt" : "Text prompt")}: “${e(d.prompt.length > 80 ? d.prompt.slice(0, 78) + "…" : d.prompt)}”</h1>
  <div class="meta">${e(new Date(d.createdAt).toLocaleString())} · ${d.live ? `Live AI (${e(d.model)})` : "Offline mode"} · Mode: ${e(d.audience)}</div>
</header>

${h2("Summary")}
<div class="kpis">${kpis}</div>
${verdictText ? `<div class="verdict"><b>${e(verdictText)}</b>${d.comparison?.reason ? `<br>${e(d.comparison.reason)}` : ""}</div>` : ""}
<p>The prompt was scored on ${d.analysis.dimensions.length} dimensions, ${d.needs.length ? `${d.needs.length} needs were stated,` : "no needs were stated,"} ${d.optimized ? `and it was rewritten with ${d.optimized.changes.length} change(s).` : "and it has not been rewritten yet."}</p>

${h2("Prompt analysis")}
<p>Score <b>${d.analysis.score}/100</b> (grade ${e(d.analysis.grade)}), ${e(d.analysis.taskType)} task, ${d.analysis.wordCount} words. The score measures how clearly the prompt states what is wanted, not how good the answer will be.</p>
<table><tr><th>Dimension</th><th>Weight</th><th style="width:40%">Score</th><th>Note</th></tr>
${d.analysis.dimensions.map((x) => `<tr><td>${e(x.label)}</td><td>${x.weight}%</td><td><div class="bar"><i style="width:${x.score * 10}%;background:${color(x.score, 10)}"></i></div> ${x.score}/10</td><td>${e(x.note)}</td></tr>`).join("")}
</table>
${d.analysis.issues.length ? `<h3>Issues found (${d.analysis.issues.length})</h3><table><tr><th>Severity</th><th>Area</th><th>Issue</th><th>How to fix</th></tr>
${d.analysis.issues.map((i) => `<tr><td><span class="sev ${e(i.severity)}">${e(i.severity)}</span></td><td>${e(i.technique)}</td><td>${e(i.message)}</td><td>${e(i.suggestion)}</td></tr>`).join("")}</table>` : "<p>No issues found.</p>"}

${h2("What you need")}
${d.needs.length ? `<table><tr><th>Need</th><th>Your answer</th></tr>${d.needs.map((x) => `<tr><td>${e(x.label)}</td><td>${e(x.value)}</td></tr>`).join("")}</table>` : "<p>No needs were stated, so the model had to guess the audience, purpose and format.</p>"}

${d.optimized ? `${h2("The rewritten prompt")}
<p>Prompt score ${d.optimized.before} → <b>${d.optimized.after}</b> (${e(d.optimized.mode === "llm" ? "AI rewrite" : "template rewrite")}). ${e(d.optimized.rationale)}</p>
<h3>Original</h3><pre>${e(d.prompt)}</pre>
<h3>Optimized (ready to use)</h3><pre>${e(d.optimized.prompt)}</pre>
${d.optimized.changes.length ? `<h3>Changes and why they help</h3><table><tr><th>Technique</th><th>What changed</th><th>Why it helps</th></tr>
${d.optimized.changes.map((c) => `<tr><td>${e(c.technique)}</td><td>${e(c.description)}</td><td>${e(lessonFor(c.technique)?.why ?? "")}</td></tr>`).join("")}</table>` : ""}` : ""}

${d.comparison ? `${h2("Answer comparison")}
<p>Both prompts were run on the same model. One judge compared the answers head to head against ${e(d.comparison.judgedAgainst)}, twice with the order swapped to cancel position bias${d.comparison.consistent ? "; both orders agreed." : "; the orders disagreed, so the result is treated as too close to call."}</p>
<table><tr><th>Criterion</th><th>Original</th><th></th><th>Optimized</th><th></th></tr>
${Object.keys(CRITERIA).map((k) => `<tr><td>${CRITERIA[k]}</td><td>${o!.scores[k] ?? "–"}</td><td><div class="bar"><i style="width:${(o!.scores[k] ?? 0) * 10}%;background:#bdb5aa"></i></div></td><td>${n!.scores[k] ?? "–"}</td><td><div class="bar"><i style="width:${(n!.scores[k] ?? 0) * 10}%;background:var(--accent)"></i></div></td></tr>`).join("")}
<tr><th>Overall</th><th>${o!.overall}</th><th></th><th>${n!.overall}</th><th></th></tr></table>
<h3>Efficiency</h3><table><tr><th></th><th>Original</th><th>Optimized</th></tr>
<tr><td>Words</td><td>${o!.words}</td><td>${n!.words}</td></tr>
${o!.tokens ? `<tr><td>Output tokens</td><td>${o!.tokens}</td><td>${n!.tokens}</td></tr>` : ""}
${o!.latencyMs ? `<tr><td>Latency</td><td>${(o!.latencyMs / 1000).toFixed(1)} s</td><td>${(n!.latencyMs! / 1000).toFixed(1)} s</td></tr>` : ""}</table>
<h3>Rule-based checks (same rules for both)</h3><table><tr><th>Check</th><th>Original</th><th>Optimized</th></tr>
${o!.checks.map((c, i) => `<tr><td>${e(c.label)}</td><td class="${c.passed ? "ok" : "no"}">${c.passed ? "Pass" : "Fail"} · ${e(c.detail)}</td><td class="${n!.checks[i]?.passed ? "ok" : "no"}">${n!.checks[i] ? `${n!.checks[i].passed ? "Pass" : "Fail"} · ${e(n!.checks[i].detail)}` : "–"}</td></tr>`).join("")}</table>
<h3>Judge feedback</h3><p><b>Original:</b> ${e(o!.feedback)}</p><p><b>Optimized:</b> ${e(n!.feedback)}</p>` : ""}

${d.images ? `${h2("Images")}
<p>Both prompts were rendered by Pollinations.ai (free, no API key) with the same seed and shape, so the difference comes from the prompt.</p>
<div class="two"><div><img src="${e(d.images.originalUrl)}" alt="Image from the original prompt" /><div class="cap">Original prompt</div></div>
<div><img src="${e(d.images.optimizedUrl)}" alt="Image from the optimized prompt" /><div class="cap">Optimized prompt</div></div></div>` : ""}

${h2("How to reuse this prompt")}
<p>Estimated prompt size: about ${estimateTokens(finalPrompt)} tokens. ${d.kind === "image" ? "Use it in any text-to-image tool, or call the free API below." : "Paste it into any chat assistant, or call an OpenAI-compatible API as below (Groq offers a free key)."}</p>
<pre>${e(snippet)}</pre>

${lessons.length ? `${h2("Techniques explained")}
${lessons.map(([, l]) => `<div class="lesson"><b>${e(l.title)}</b>: ${e(l.what)}<br><span style="color:var(--muted)">Why: ${e(l.why)}</span>
<div class="two" style="margin-top:6px"><pre>Before: ${e(l.before)}</pre><pre>After: ${e(l.after)}</pre></div></div>`).join("")}` : ""}

${d.comparison ? `${h2("Appendix: the two answers")}
<h3>Answer to the original prompt</h3><pre>${e(clip(o!.answer))}</pre>
<h3>Answer to the optimized prompt</h3><pre>${e(clip(n!.answer))}</pre>` : ""}

<footer>Generated by PromptForge AI on ${e(new Date(d.createdAt).toLocaleString())}. Scores are estimates: the prompt score is rule-based, answer scores come from an LLM judge corrected for position bias.</footer>
</div></body></html>`;
}

function kpi(label: string, value: string, sub: string) {
  return `<div class="kpi"><div class="l">${esc(label)}</div><div class="v">${esc(value)}</div><div class="s">${esc(sub)}</div></div>`;
}
function color(v: number, max: number) {
  const p = v / max;
  return p >= 0.7 ? "#1f8a4c" : p >= 0.45 ? "#b7791f" : "#c2362f";
}
function unique<T>(xs: T[]) {
  return [...new Set(xs)];
}
function clip(t: string) {
  return t.length > 6000 ? `${t.slice(0, 6000)}\n… (truncated)` : t;
}
function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
