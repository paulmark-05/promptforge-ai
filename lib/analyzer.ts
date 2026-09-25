// Rule-based prompt analyzer. Deterministic and instant, so it works without an
// API key and gives the same score for the same prompt (useful for benchmarking).

export type DimensionKey =
  | "clarity"
  | "specificity"
  | "context"
  | "role"
  | "format"
  | "constraints"
  | "examples"
  | "structure";

export interface Dimension {
  key: DimensionKey;
  label: string;
  weight: number; // share of the 100-point total
  score: number; // 0..10
  note: string;
}

export type Severity = "high" | "medium" | "low";

export interface Issue {
  id: string;
  severity: Severity;
  message: string;
  suggestion: string;
  technique: string;
}

export type TaskType =
  | "coding"
  | "writing"
  | "explanation"
  | "summarization"
  | "analysis"
  | "brainstorming"
  | "translation"
  | "general";

export interface Analysis {
  score: number; // 0..100
  grade: "A" | "B" | "C" | "D" | "F";
  taskType: TaskType;
  wordCount: number;
  dimensions: Dimension[];
  issues: Issue[];
  strengths: string[];
  injectionRisk: boolean;
}

export const DIMENSIONS: { key: DimensionKey; label: string; weight: number }[] = [
  { key: "clarity", label: "Clarity", weight: 20 },
  { key: "specificity", label: "Specificity", weight: 15 },
  { key: "context", label: "Context", weight: 15 },
  { key: "role", label: "Role / Persona", weight: 10 },
  { key: "format", label: "Output Format", weight: 15 },
  { key: "constraints", label: "Constraints", weight: 10 },
  { key: "examples", label: "Examples", weight: 10 },
  { key: "structure", label: "Structure", weight: 5 },
];

const ACTION_VERBS =
  /\b(write|explain|summari[sz]e|list|generate|create|compare|analy[sz]e|translate|classify|describe|draft|design|build|implement|fix|debug|review|rewrite|outline|plan|suggest|recommend|calculate|convert|extract|identify|evaluate|define|teach|brainstorm|refactor|optimi[sz]e|answer|give|provide|make|find|solve|prepare|compose|edit|proofread)\b/i;
const VAGUE_WORDS =
  /\b(something|stuff|things?|good|nice|better|some|etc|whatever|anything|kind of|sort of|a bit|maybe|interesting|cool|best)\b/gi;
const NUMBER = /\b\d+(\.\d+)?\b/;
const CONTEXT_CUES =
  /\b(i am|i'm|we are|my|our|for (a|an|my|our|the)|because|so that|in order to|context|background|audience|beginners?|students?|customers?|clients?|team|purpose|goal|currently|project)\b/i;
const ROLE_CUES = /\b(you are|act as|acting as|as an? (expert|senior|experienced|professional)|imagine you are|pretend to be|role:|persona)\b/i;
const FORMAT_CUES =
  /\b(format|bullet|bullets|bullet points|table|json|markdown|csv|yaml|list of|numbered|headings?|sections?|paragraphs?|steps?|outline|code block|template|in \d+ (words|sentences|lines|paragraphs|points|bullets))\b/i;
const CONSTRAINT_CUES =
  /\b(must|should|do not|don't|avoid|only|limit|under \d+|at most|at least|no more than|maximum|minimum|exactly|within|tone|formal|informal|concise|brief|without|never|always|ensure)\b/gi;
const EXAMPLE_CUES = /\b(for example|for instance|e\.g\.|example:|examples:|such as|like this|input:|output:|sample)\b/i;
const INJECTION =
  /\b(ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?|rules)|disregard (your|the) (rules|instructions)|reveal (your|the) (system )?prompt|jailbreak|developer mode|DAN)\b/i;

const clamp = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, n));

export function detectTaskType(prompt: string): TaskType {
  const p = prompt.toLowerCase();
  // "function" and "class" alone are ambiguous ("family function", "Class 10"), so they
  // only count as coding when used as programming terms.
  if (
    /\b(code|python|javascript|typescript|java|sql|bug|debug|api|regex|script|program|algorithm|refactor|compile)\b/.test(p) ||
    /\b(write|implement|create|define) an? (\w+ )?(function|class|method)\b/.test(p)
  )
    return "coding";
  if (/\b(summari[sz]e|summary|tl;?dr|condense|key points)\b/.test(p)) return "summarization";
  if (/\b(translate|translation|in (hindi|french|spanish|german|english|japanese))\b/.test(p)) return "translation";
  if (/\b(analy[sz]e|compare|evaluate|pros and cons|assess|review|critique)\b/.test(p)) return "analysis";
  if (/\b(ideas|brainstorm|suggest|names for|slogans?|list of)\b/.test(p)) return "brainstorming";
  if (/\b(explain|what is|what are|how does|how do|why|teach|define)\b/.test(p)) return "explanation";
  if (/\b(write|essay|story|poem|email|letter|blog|article|post|caption|cover letter|draft)\b/.test(p)) return "writing";
  return "general";
}

export function analyzePrompt(raw: string): Analysis {
  const prompt = raw.trim();
  const words = prompt.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lines = prompt.split(/\n/).filter((l) => l.trim());
  const vagueHits = (prompt.match(VAGUE_WORDS) || []).length;
  const constraintHits = new Set((prompt.match(CONSTRAINT_CUES) || []).map((m) => m.toLowerCase())).size;
  const questionCount = (prompt.match(/\?/g) || []).length;
  const hasDelimiters = /(^|\n)\s*(#{1,4} |[-*] |\d+[.)] )|"""|```|<\w+>|---/.test(prompt);
  const injectionRisk = INJECTION.test(prompt);

  // Each dimension is scored 0..10 with a short explanation.
  const s = {} as Record<DimensionKey, { score: number; note: string }>;

  {
    let score = 0;
    if (ACTION_VERBS.test(prompt) || questionCount > 0) score += 5;
    if (wordCount >= 6) score += 2;
    if (wordCount >= 12) score += 1;
    score += 2 - Math.min(2, vagueHits * 0.7);
    if (questionCount > 2) score -= 2;
    if (wordCount > 200 && lines.length < 3) score -= 2;
    s.clarity = {
      score: clamp(score),
      note: vagueHits ? `${vagueHits} vague word(s) found` : ACTION_VERBS.test(prompt) ? "Clear action verb" : "No clear task verb",
    };
  }
  {
    let score = Math.min(5, wordCount / 8);
    if (NUMBER.test(prompt)) score += 2;
    const properNouns = words.slice(1).filter((w) => /^[A-Z][a-z]+/.test(w)).length;
    score += Math.min(2, properNouns * 0.5);
    if (/\b(beginner|expert|intermediate|\d+[- ]year|grade|level)\b/i.test(prompt)) score += 1;
    score -= Math.min(2, vagueHits * 0.5);
    s.specificity = { score: clamp(score), note: `${wordCount} words${NUMBER.test(prompt) ? ", includes concrete numbers" : ", no concrete numbers"}` };
  }
  {
    const hits = (prompt.match(new RegExp(CONTEXT_CUES.source, "gi")) || []).length;
    const score = hits === 0 ? 0 : clamp(3 + hits * 2);
    s.context = { score, note: hits ? `${hits} context cue(s)` : "No background or audience given" };
  }
  {
    const has = ROLE_CUES.test(prompt);
    s.role = { score: has ? 10 : 0, note: has ? "Assigns a role to the model" : "No role or persona" };
  }
  {
    const hits = (prompt.match(new RegExp(FORMAT_CUES.source, "gi")) || []).length;
    const score = hits === 0 ? 0 : clamp(5 + hits * 2.5);
    s.format = { score, note: hits ? "Output format specified" : "Output format not specified" };
  }
  {
    const score = clamp(constraintHits * 3);
    s.constraints = { score, note: constraintHits ? `${constraintHits} constraint(s)` : "No constraints or limits" };
  }
  {
    const has = EXAMPLE_CUES.test(prompt);
    s.examples = { score: has ? 10 : 0, note: has ? "Includes example(s)" : "No examples (zero-shot)" };
  }
  {
    let score = 2;
    if (lines.length >= 3) score += 3;
    if (hasDelimiters) score += 5;
    if (wordCount < 15) score = Math.max(score, 5); // short prompts do not need sections
    s.structure = { score: clamp(score), note: hasDelimiters ? "Uses sections or delimiters" : "Single block of text" };
  }

  const dimensions: Dimension[] = DIMENSIONS.map((d) => ({ ...d, score: round1(s[d.key].score), note: s[d.key].note }));
  let score = Math.round(dimensions.reduce((sum, d) => sum + (d.score / 10) * d.weight, 0));
  if (injectionRisk) score = Math.min(score, 20);
  if (wordCount === 0) score = 0;

  return {
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F",
    taskType: detectTaskType(prompt),
    wordCount,
    dimensions,
    issues: findIssues(prompt, dimensions, { wordCount, vagueHits, questionCount, injectionRisk }),
    strengths: dimensions.filter((d) => d.score >= 7).map((d) => `${d.label}: ${d.note}`),
    injectionRisk,
  };
}

function findIssues(
  prompt: string,
  dims: Dimension[],
  f: { wordCount: number; vagueHits: number; questionCount: number; injectionRisk: boolean },
): Issue[] {
  const d = Object.fromEntries(dims.map((x) => [x.key, x.score])) as Record<DimensionKey, number>;
  const issues: Issue[] = [];
  const add = (id: string, severity: Severity, message: string, suggestion: string, technique: string) =>
    issues.push({ id, severity, message, suggestion, technique });

  if (f.injectionRisk)
    add("injection", "high", "Prompt contains an instruction-override / injection pattern.", "Remove attempts to override system rules. State your real task directly.", "Safety");
  if (f.wordCount < 8)
    add("too-short", "high", `Prompt is very short (${f.wordCount} words), so the model must guess what you want.`, "Add the goal, the audience and what a good answer looks like.", "Specificity");
  if (f.vagueHits >= 2)
    add("vague", "medium", `Contains ${f.vagueHits} vague words (e.g. "good", "some", "things").`, "Replace vague words with measurable details: numbers, names, criteria.", "Specificity");
  if (d.clarity < 5)
    add("no-task", "high", "The task is unclear: no action verb or direct question.", 'Start with a clear instruction such as "Write", "Explain", "Compare".', "Clear instruction");
  if (d.context === 0)
    add("no-context", "medium", "No background, purpose or audience is given.", "Say who the answer is for and why you need it.", "Context setting");
  if (d.role === 0)
    add("no-role", "low", "The model is not given a role or expertise.", 'Add a persona, e.g. "You are an experienced data engineer."', "Role prompting");
  if (d.format === 0)
    add("no-format", "medium", "The expected output format is not specified.", "Ask for a specific format: bullet list, table, JSON, N paragraphs.", "Output formatting");
  if (d.constraints === 0)
    add("no-constraints", "low", "No constraints such as length, tone or scope.", 'Add limits, e.g. "under 150 words, formal tone, no jargon".', "Constraints");
  if (d.examples === 0 && f.wordCount >= 8)
    add("no-examples", "low", "No examples of the desired output.", "Show one short example of the input and output you expect (few-shot).", "Few-shot prompting");
  if (f.questionCount > 2)
    add("multi-question", "medium", `Asks ${f.questionCount} questions at once.`, "Split into numbered sub-tasks so each one is answered.", "Task decomposition");
  if (f.wordCount > 150 && d.structure < 5)
    add("wall-of-text", "medium", "Long prompt with no sections.", "Use headings or delimiters (###, triple quotes) to separate instructions from data.", "Delimiters");
  if (/\b(analy[sz]e|solve|calculate|reason|debug|prove|decide|plan)\b/i.test(prompt) && !/step[- ]by[- ]step|reasoning|think/i.test(prompt))
    add("no-cot", "low", "A reasoning-heavy task without a request to reason through it.", "Ask the model to work through the problem step by step before the final answer.", "Chain-of-thought");

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
