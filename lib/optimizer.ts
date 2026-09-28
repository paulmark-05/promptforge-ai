// Template-based optimizer used when no LLM key is configured (offline mode).
// It rebuilds the prompt into labelled sections using standard prompt
// engineering techniques. Needs the user confirmed are always included; any
// other defaults stay neutral, so the prompt never gains invented requirements.

import { analyzePrompt, type TaskType } from "./analyzer.ts";
import { hasIntent, type Intent } from "./intent.ts";

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
  explanation: "Start with a one-sentence definition, explain the key points, then give one real-world example.",
  summarization: "A one-line TL;DR, followed by bullet points with the key takeaways.",
  analysis: "A markdown table comparing the options on clear criteria, followed by a 2 to 3 sentence recommendation.",
  brainstorming: "A numbered list of ideas, each with a one-sentence rationale.",
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

// A short example of the wanted style, on an unrelated topic, so it shows form without inventing content.
const FEWSHOT: Record<TaskType, string> = {
  coding: 'Example of the style wanted:\n"Approach: use two pointers. Code: (one short block). Usage: is_ok(\'abc\') returns False."',
  writing: 'Example of the style wanted:\n"Hi Priya, thanks for the quick reply. I have attached the notes and will follow up on Friday."',
  explanation: 'Example of the style wanted:\n"Photosynthesis is how plants make food from sunlight. For example, a leaf turns light, water and air into sugar."',
  summarization: 'Example of the style wanted:\n"TL;DR: sales rose because of the new app.\n- Downloads doubled\n- Repeat orders grew"',
  analysis: 'Example of the style wanted:\n"Option A is cheaper but slower. Recommendation: choose A if the budget is fixed."',
  brainstorming: 'Example of the style wanted:\n"1. Campus laundry pickup: students lack time, and it needs only a bike and a phone."',
  translation: 'Example of the style wanted:\n"Bonjour, comment allez-vous ? (formal; \'tu\' would be casual)"',
  general: 'Example of the style wanted:\n"Short answer first, then the reasons in two or three sentences."',
};

export function optimizeOffline(prompt: string, techniques: TechniqueId[], intent?: Intent | null): OptimizeResult {
  const a = analyzePrompt(prompt);
  const t = a.taskType;
  const dim = Object.fromEntries(a.dimensions.map((d) => [d.key, d.score]));
  const use = (id: TechniqueId) => techniques.includes(id);
  const need = hasIntent(intent) ? intent : null;
  const changes: Change[] = [];
  const sections: [string, string][] = [];

  if (use("role") && dim.role < 7) {
    sections.push(["Role", ROLES[t]]);
    changes.push({ technique: "Role prompting", description: `Added an expert persona suited to ${article(t)} ${t} task.` });
  }
  sections.push(["Task", prompt.trim()]);

  // Confirmed needs always go in: they are the user's real requirements.
  const context = need ? [need.audience.trim() && `This is for: ${need.audience.trim()}.`, need.goal.trim() && `Purpose: ${need.goal.trim()}.`].filter(Boolean) : [];
  if (context.length) {
    sections.push(["Context", context.join("\n")]);
    changes.push({ technique: "Context setting", description: "Added the audience and purpose you confirmed." });
  } else if (use("context") && dim.context < 5) {
    sections.push(["Context", "No audience is given, so write for an intelligent reader who is new to the topic."]);
    changes.push({ technique: "Context setting", description: "Set a neutral default audience because none was confirmed." });
  }
  if (use("cot")) {
    sections.push(["Approach", COT[t]]);
    changes.push({ technique: "Chain-of-thought", description: "Asked the model to reason step by step before answering." });
  }
  const format = need?.format.trim();
  if (format) {
    sections.push(["Output format", `${format}.`]);
    changes.push({ technique: "Output formatting", description: "Used the format you asked for." });
  } else if (use("format") && dim.format < 7) {
    sections.push(["Output format", FORMATS[t]]);
    changes.push({ technique: "Output formatting", description: "Defined a clear structure for the answer." });
  }

  const rules: string[] = [];
  const length = need?.length.trim();
  if (length && !/as long as needed/i.test(length)) rules.push(`Keep it ${length.charAt(0).toLowerCase()}${length.slice(1)}.`);
  if (need?.tone.trim()) rules.push(`Tone: ${need.tone.trim()}.`);
  if (need?.notes.trim()) rules.push(need.notes.trim().replace(/([^.])$/, "$1."));
  if (use("constraints") && dim.constraints < 7) {
    rules.push("Use plain language and explain any technical terms.", "If something is uncertain, say so instead of guessing.");
  }
  if (rules.length) {
    sections.push([need ? "Requirements" : "Constraints", rules.map((r) => `- ${r}`).join("\n")]);
    changes.push({
      technique: "Constraints",
      description: need ? "Added the length, tone and other needs you confirmed." : "Added clarity and honesty rules, without inventing a length limit.",
    });
  }
  if (use("fewshot") && dim.examples < 7) {
    sections.push(["Example", FEWSHOT[t]]);
    changes.push({ technique: "Few-shot prompting", description: "Added a short example of the wanted style on an unrelated topic." });
  }

  const delim = use("delimiters");
  if (delim) changes.push({ technique: "Delimiters", description: "Organised the prompt into labelled sections." });
  const optimizedPrompt = sections.map(([h, body]) => (delim ? `### ${h}\n${body}` : body)).join("\n\n");

  return {
    optimizedPrompt,
    changes,
    rationale: need
      ? `Built from the needs you confirmed for this ${t} task, using ${changes.length} prompt-engineering technique(s).`
      : `Detected ${article(t)} ${t} task and applied ${changes.length} technique(s). No needs were confirmed, so the prompt leaves audience and length open.`,
    mode: "offline",
  };
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
