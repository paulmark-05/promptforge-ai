// Objective, rule-based checks on a model response. These complement the
// LLM-as-judge scores with numbers that do not depend on another model call.

export interface ResponseMetrics {
  wordCount: number;
  sentenceCount: number;
  readability: number; // Flesch reading ease, 0..100 (higher = easier)
  hasStructure: boolean; // headings, lists or tables
  checks: { label: string; passed: boolean; detail: string }[];
  complianceRate: number; // share of checks passed, 0..1
}

export function responseMetrics(prompt: string, response: string): ResponseMetrics {
  const text = response.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+(\s|$)/).filter((s) => s.trim().length > 1);
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const wc = Math.max(1, words.length);
  const sc = Math.max(1, sentences.length);
  const readability = Math.round(Math.max(0, Math.min(100, 206.835 - 1.015 * (wc / sc) - 84.6 * (syllables / wc))));
  const hasStructure = /(^|\n)\s*(#{1,6} |[-*] |\d+[.)] |\|.+\|)/.test(text);

  const checks: ResponseMetrics["checks"] = [];
  const p = prompt.toLowerCase();

  const limit = p.match(/\b(?:under|less than|at most|no more than|maximum of|within)\s+(\d+)\s+words\b/);
  if (limit) {
    const max = Number(limit[1]);
    checks.push({ label: "Word limit", passed: words.length <= max, detail: `${words.length} / ${max} words` });
  }
  const exact = p.match(/\b(\d+)\s+(bullet points|bullets|points|ideas|tips|steps|examples|reasons)\b/);
  if (exact) {
    const want = Number(exact[1]);
    const got = (text.match(/(^|\n)\s*([-*•]|\d+[.)])\s+/g) || []).length;
    checks.push({ label: "Item count", passed: got >= want, detail: `${got} list items, ${want} requested` });
  }
  if (/\bjson\b/.test(p)) {
    checks.push({ label: "Valid JSON", passed: isJson(text), detail: isJson(text) ? "Parses as JSON" : "Does not parse as JSON" });
  }
  if (/\btable\b/.test(p)) {
    const ok = /\|.+\|\s*\n\s*\|?\s*:?-{3,}/.test(text);
    checks.push({ label: "Table present", passed: ok, detail: ok ? "Markdown table found" : "No table found" });
  }
  if (/\b(code|function|script|program)\b/.test(p)) {
    const ok = /```/.test(text);
    checks.push({ label: "Code block", passed: ok, detail: ok ? "Fenced code block found" : "No fenced code block" });
  }
  if (/\b(bullet|bullets|list)\b/.test(p)) {
    checks.push({ label: "List format", passed: hasStructure, detail: hasStructure ? "Uses a list" : "No list found" });
  }
  checks.push({ label: "Non-empty", passed: words.length > 0, detail: `${words.length} words` });

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    readability,
    hasStructure,
    checks,
    complianceRate: checks.filter((c) => c.passed).length / checks.length,
  };
}

function isJson(text: string) {
  const body = text.replace(/^```(json)?\s*|\s*```$/g, "");
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

function countSyllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}
