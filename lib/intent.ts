// The user's real need, stated explicitly. A vague prompt leaves these open,
// so the model guesses; PromptForge asks the user to confirm them instead.
// The confirmed intent drives the optimizer AND is the yardstick answers are
// judged against, so nothing the user did not ask for is ever rewarded.

import type { TaskType } from "./analyzer.ts";

export interface Intent {
  audience: string;
  goal: string;
  length: string;
  format: string;
  tone: string;
  notes: string;
}

export type IntentField = keyof Intent;
export type IntentOptions = Record<Exclude<IntentField, "notes">, string[]>;

export const EMPTY_INTENT: Intent = { audience: "", goal: "", length: "", format: "", tone: "", notes: "" };

export const INTENT_FIELDS: { key: IntentField; label: string; question: string; placeholder: string }[] = [
  { key: "audience", label: "Audience", question: "Who is it for?", placeholder: "e.g. my 12-year-old sister" },
  { key: "goal", label: "Purpose", question: "What will you use it for?", placeholder: "e.g. revise before an exam" },
  { key: "length", label: "Length", question: "How long should it be?", placeholder: "e.g. under 150 words" },
  { key: "format", label: "Format", question: "What shape should it take?", placeholder: "e.g. bullet points" },
  { key: "tone", label: "Tone", question: "What tone?", placeholder: "e.g. simple and friendly" },
  { key: "notes", label: "Anything else", question: "Anything else it must include or avoid?", placeholder: "e.g. one everyday example, no jargon" },
];

// "Under N words" is phrased so the rule-based checks can verify it.
const LENGTHS = ["Under 100 words", "Under 250 words", "Under 500 words", "As long as needed"];
const TONES = ["Simple and friendly", "Professional", "Formal", "Technical"];

const PRESETS: Record<TaskType, Omit<IntentOptions, "length" | "tone">> = {
  explanation: {
    audience: ["Complete beginner", "Student preparing for an exam", "Working professional"],
    goal: ["Understand the basic idea", "Revise for an exam", "Explain it to someone else"],
    format: ["Short paragraphs", "Bullet points", "Step-by-step list"],
  },
  coding: {
    audience: ["Beginner programmer", "Experienced developer", "My team's code reviewer"],
    goal: ["Use it in a real project", "Learn how it works", "Practise for an interview"],
    format: ["Code with brief comments", "Code plus explanation", "Code only"],
  },
  writing: {
    audience: ["My manager", "Customers on social media", "A general audience"],
    goal: ["Send it today as is", "A first draft to edit", "Post on social media"],
    format: ["Short paragraphs", "A short email", "Three options to choose from"],
  },
  summarization: {
    audience: ["Me, for quick revision", "A busy manager", "School students"],
    goal: ["Quick revision", "Decide whether to read more", "Share with others"],
    format: ["Bullet points", "One short paragraph", "A table"],
  },
  analysis: {
    audience: ["My team making a decision", "A technical lead", "A non-technical stakeholder"],
    goal: ["Make a decision", "Understand the trade-offs", "Present to others"],
    format: ["A table", "Pros and cons list", "Short paragraphs"],
  },
  brainstorming: {
    audience: ["A student with a small budget", "A small business owner", "A marketing team"],
    goal: ["Pick one idea to start soon", "A broad list to explore", "Low-cost options only"],
    format: ["Numbered list", "A table", "Bullet points"],
  },
  translation: {
    audience: ["A business contact", "A friend", "A native speaker"],
    goal: ["Send in a message", "Use in a document", "Understand the meaning"],
    format: ["Translation only", "Translation with notes", "Two versions: formal and casual"],
  },
  general: {
    audience: ["Complete beginner", "Someone with some background", "An expert"],
    goal: ["Understand the basic idea", "Make a decision", "Get something I can use now"],
    format: ["Short paragraphs", "Bullet points", "Step-by-step list"],
  },
};

export function presetOptions(task: TaskType): IntentOptions {
  return { ...PRESETS[task], length: LENGTHS, tone: TONES };
}

export function hasIntent(intent: Intent | null | undefined): intent is Intent {
  return !!intent && Object.values(intent).some((v) => v.trim());
}

// The yardstick: the original request plus the needs the user confirmed.
export function intentStatement(prompt: string, intent: Intent | null | undefined): string {
  if (!hasIntent(intent)) return prompt.trim();
  const lines: string[] = [];
  if (intent.audience.trim()) lines.push(`- It is for: ${intent.audience.trim()}`);
  if (intent.goal.trim()) lines.push(`- Purpose: ${intent.goal.trim()}`);
  if (intent.length.trim() && !/as long as needed/i.test(intent.length)) lines.push(`- Length: ${intent.length.trim()}`);
  if (intent.format.trim()) lines.push(`- Format: ${intent.format.trim()}`);
  if (intent.tone.trim()) lines.push(`- Tone: ${intent.tone.trim()}`);
  if (intent.notes.trim()) lines.push(`- Also: ${intent.notes.trim()}`);
  return `${prompt.trim()}\n\nWhat I actually need:\n${lines.join("\n")}`;
}

// Merge LLM suggestions with presets: keep up to 3 valid, short, distinct options per field.
export function mergeOptions(fromLlm: Partial<Record<string, unknown>> | null, presets: IntentOptions, opts: { openLength?: boolean } = {}): IntentOptions {
  const out = { ...presets };
  if (!fromLlm) return out;
  for (const key of Object.keys(presets) as (keyof IntentOptions)[]) {
    const raw = fromLlm[key];
    if (!Array.isArray(raw)) continue;
    const clean = raw
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().replace(/[.]$/, "").replace(/[‐‑]/g, "-").replace(/[  ]/g, " "))
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .filter((x) => x.length > 1 && x.length <= 60);
    const unique = [...new Set(clean)].slice(0, 3);
    if (unique.length >= 2) out[key] = key === "length" && opts.openLength !== false ? [...unique, "As long as needed"].slice(0, 4) : unique;
  }
  return out;
}
