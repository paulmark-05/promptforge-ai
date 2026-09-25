// Template-based optimizer used when no LLM key is configured (offline mode).
// It rebuilds the prompt into labelled sections using standard prompt
// engineering techniques, filling in defaults based on the detected task type.

import { analyzePrompt, type TaskType } from "./analyzer.ts";

export type TechniqueId = "role" | "context" | "cot" | "format" | "constraints" | "fewshot" | "delimiters";

export const TECHNIQUES: { id: TechniqueId; label: string; description: string }[] = [
  { id: "role", label: "Role prompting", description: "Give the model an expert persona." },
  { id: "context", label: "Context setting", description: "State the audience and purpose." },
  { id: "cot", label: "Chain-of-thought", description: "Ask for step-by-step reasoning." },
  { id: "format", label: "Output format", description: "Define the exact shape of the answer." },
  { id: "constraints", label: "Constraints", description: "Set length, tone and scope limits." },
  { id: "fewshot", label: "Few-shot example", description: "Show an example of a good answer." },
  { id: "delimiters", label: "Delimiters", description: "Separate sections with clear headings." },
];

export interface Change {
  technique: string;
  description: string;
}

export interface OptimizeResult {
  optimizedPrompt: string;
  changes: Change[];
  rationale: string;
  mode: "llm" | "offline";
}

const ROLES: Record<TaskType, string> = {
  coding: "You are a senior software engineer who writes clean, correct and well-commented code.",
  writing: "You are a professional writer and editor with a clear, engaging style.",
  explanation: "You are an expert teacher who explains complex topics in simple, accurate terms.",
  summarization: "You are an expert analyst who writes precise and faithful summaries.",
  analysis: "You are a rigorous analyst who weighs evidence and states assumptions openly.",
  brainstorming: "You are a creative strategist who generates original and practical ideas.",
  translation: "You are a professional translator who preserves meaning, tone and nuance.",
  general: "You are a knowledgeable and careful assistant.",
};

const FORMATS: Record<TaskType, string> = {
  coding: "1. A short explanation of the approach.\n2. The complete code in a single fenced code block.\n3. A short example showing how to run or use it.",
  writing: "Well-structured prose with a clear opening, body and closing. Use short paragraphs.",
  explanation: "Start with a one-sentence definition, explain the idea in 3 to 5 bullet points, then end with one real-world example.",
  summarization: "A one-line TL;DR, followed by 5 bullet points with the key takeaways.",
  analysis: "A markdown table comparing the options on clear criteria, followed by a 2 to 3 sentence recommendation.",
  brainstorming: "A numbered list of 10 ideas, each with a one-sentence rationale.",
  translation: "Only the translated text, followed by brief notes on any phrase with no direct equivalent.",
  general: "A clear, well-organised answer using short paragraphs or bullet points.",
};

const COT: Record<TaskType, string> = {
  coding: "Before writing code, think through the requirements and edge cases step by step.",
  writing: "First outline the key points you will cover, then write the final text.",
  explanation: "Build the explanation step by step, from the basic idea to the details.",
  summarization: "First identify the main argument and supporting points, then write the summary.",
  analysis: "Reason through the problem step by step and state your assumptions before the conclusion.",
  brainstorming: "Consider different angles (audience, cost, novelty) before listing ideas.",
  translation: "Read the full text first to understand context and tone, then translate.",
  general: "Think through the question step by step before giving your final answer.",
};

export function optimizeOffline(prompt: string, techniques: TechniqueId[]): OptimizeResult {
  const a = analyzePrompt(prompt);
  const t = a.taskType;
  const dim = Object.fromEntries(a.dimensions.map((d) => [d.key, d.score]));
  const use = (id: TechniqueId) => techniques.includes(id);
  const changes: Change[] = [];
  const sections: [string, string][] = [];

  if (use("role") && dim.role < 7) {
    sections.push(["Role", ROLES[t]]);
    changes.push({ technique: "Role prompting", description: `Added an expert persona suited to ${article(t)} ${t} task.` });
  }
  sections.push(["Task", prompt.trim()]);
  if (use("context") && dim.context < 5) {
    sections.push(["Context", "Audience: [who will read this, e.g. beginners, managers]\nPurpose: [why you need it and how it will be used]"]);
    changes.push({ technique: "Context setting", description: "Added audience and purpose slots for you to fill in." });
  }
  if (use("cot")) {
    sections.push(["Approach", COT[t]]);
    changes.push({ technique: "Chain-of-thought", description: "Asked the model to reason step by step before answering." });
  }
  if (use("format") && dim.format < 7) {
    sections.push(["Output format", FORMATS[t]]);
    changes.push({ technique: "Output formatting", description: "Defined the structure of the expected answer." });
  }
  if (use("constraints") && dim.constraints < 7) {
    sections.push([
      "Constraints",
      "- Keep the answer under 300 words unless more detail is essential.\n- Use plain language and define any technical terms.\n- If information is missing or uncertain, say so instead of guessing.",
    ]);
    changes.push({ technique: "Constraints", description: "Added length, clarity and honesty constraints." });
  }
  if (use("fewshot") && dim.examples < 7) {
    sections.push(["Example", "For example, a good answer looks like this:\n[paste one short example of the output you want]"]);
    changes.push({ technique: "Few-shot prompting", description: "Added a slot for an example of the ideal output." });
  }

  const delim = use("delimiters");
  if (delim) changes.push({ technique: "Delimiters", description: "Organised the prompt into labelled sections." });
  const optimizedPrompt = sections
    .map(([h, body]) => (delim ? `### ${h}\n${body}` : body))
    .join("\n\n");

  return {
    optimizedPrompt,
    changes,
    rationale: `Detected ${article(t)} ${t} task. Rebuilt the prompt with ${changes.length} prompt-engineering technique(s). Replace any [bracketed] slots with your own details for the best result.`,
    mode: "offline",
  };
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
