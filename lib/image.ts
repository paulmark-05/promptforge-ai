// Image prompts: analysis, the needs to ask about, an offline rewrite, and the
// free Pollinations.ai image URL used to render both versions side by side.

import { analyzePrompt, type Issue, type Severity } from "./analyzer.ts";
import { hasIntent, type Intent, type IntentOptions } from "./intent.ts";

export interface PromptDimension {
  key: string;
  label: string;
  weight: number;
  score: number; // 0..10
  note: string;
}

export interface ImageAnalysis {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  taskType: "image";
  wordCount: number;
  dimensions: PromptDimension[];
  issues: Issue[];
  strengths: string[];
  injectionRisk: boolean;
}

const RX = {
  style: /\b(photo\w*|realistic|watercolou?r|oil painting|acrylic|illustration|3d|render|anime|cartoon|pixel art|sketch|drawing|digital art|cinematic|minimalist|flat|vector|isometric|low poly|poster|line art|pencil|charcoal|comic|clay|paper ?cut|studio photo)\b/i,
  composition: /\b(close-?up|wide shot|wide-angle|wide angle|aerial|from above|top-down|bird'?s-eye|full body|portrait shot|centered|centred|rule of thirds|macro|bokeh|depth of field|\d+ ?mm|lens|angle|low angle|eye level|foreground|background|framing|symmetr\w*)\b/i,
  lighting: /\b(light|lighting|lit|golden hour|sunset|sunrise|dusk|dawn|night|neon|studio|soft|dramatic|backlit|shadows?|moody|bright|dark|glow\w*|overcast|candle\w*|rim light)\b/i,
  color: /\b(red|blue|green|orange|yellow|purple|violet|pink|teal|turquoise|black|white|gold\w*|silver|pastel|monochrome|palette|vibrant|muted|colou?rful|warm tones|cool tones|sepia|navy|beige)\b/i,
  detail: /\b(detailed|high detail|sharp|4k|8k|hd|intricate|texture\w*|clean|high quality|crisp|ultra|fine)\b/i,
  aspect: /\b(\d+:\d+|square|landscape|portrait orientation|vertical|horizontal|widescreen|banner|wallpaper)\b/i,
  negative: /\b(no|without|avoid|exclude|free of)\b\s+\w+/i,
  relation: /\b(of|with|in|on|at|holding|sitting|standing|wearing|under|over|beside|next to|near)\b/i,
};

export const IMAGE_DIMENSIONS: { key: string; label: string; weight: number; technique: string; severity: Severity; missing: string; fix: string }[] = [
  { key: "subject", label: "Subject", weight: 25, technique: "Subject", severity: "high", missing: "The subject is thin, so the model fills in random details.", fix: "Describe the main subject: what it is, what it is doing, and where." },
  { key: "style", label: "Style / medium", weight: 18, technique: "Style and medium", severity: "medium", missing: "No style or medium is given.", fix: "Say what it should look like, for example photo, watercolor or 3D render." },
  { key: "composition", label: "Composition", weight: 14, technique: "Composition and camera", severity: "low", missing: "No framing or viewpoint.", fix: "Add framing, for example close-up, wide shot or from above." },
  { key: "lighting", label: "Lighting / mood", weight: 14, technique: "Lighting and mood", severity: "medium", missing: "No lighting or mood.", fix: "Describe the light, for example golden hour or soft studio light." },
  { key: "color", label: "Color", weight: 10, technique: "Color palette", severity: "low", missing: "No colors or palette.", fix: "Name the colors you want, for example warm oranges and deep blues." },
  { key: "detail", label: "Detail", weight: 9, technique: "Detail and quality", severity: "low", missing: "No detail or finish words.", fix: "Add a few words like sharp focus or highly detailed." },
  { key: "aspect", label: "Shape", weight: 5, technique: "Aspect ratio", severity: "low", missing: "No shape given in the prompt.", fix: "Pick a shape in the next step, for example square or 16:9." },
  { key: "negative", label: "Avoid", weight: 5, technique: "What to avoid", severity: "low", missing: "Nothing to avoid is stated.", fix: "Say what must not appear, for example no text or no people." },
];

export function analyzeImagePrompt(raw: string): ImageAnalysis {
  const prompt = raw.trim();
  const words = prompt.split(/\s+/).filter(Boolean);
  const wc = words.length;
  const injectionRisk = analyzePrompt(prompt).injectionRisk;

  const scoreOf: Record<string, { score: number; note: string }> = {
    subject: {
      score: Math.min(10, (wc >= 3 ? 4 : wc) + (RX.relation.test(prompt) ? 3 : 0) + Math.min(3, Math.max(0, wc - 4) * 0.5)),
      note: `${wc} words${RX.relation.test(prompt) ? ", with details" : ""}`,
    },
    style: hit(RX.style, prompt, "Style given", "No style"),
    composition: hit(RX.composition, prompt, "Framing given", "No framing"),
    lighting: hit(RX.lighting, prompt, "Lighting given", "No lighting"),
    color: hit(RX.color, prompt, "Colors given", "No colors"),
    detail: hit(RX.detail, prompt, "Detail words", "No detail words"),
    aspect: hit(RX.aspect, prompt, "Shape given", "No shape"),
    negative: hit(RX.negative, prompt, "Says what to avoid", "Nothing to avoid"),
  };

  const dimensions = IMAGE_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, weight: d.weight, score: round1(scoreOf[d.key].score), note: scoreOf[d.key].note }));
  let score = Math.round(dimensions.reduce((s, d) => s + (d.score / 10) * d.weight, 0));
  if (injectionRisk) score = Math.min(score, 20);
  if (wc === 0) score = 0;

  const issues: Issue[] = [];
  if (injectionRisk) issues.push({ id: "injection", severity: "high", message: "Prompt contains an instruction-override pattern.", suggestion: "Describe the image you want instead.", technique: "Safety" });
  for (const d of IMAGE_DIMENSIONS) {
    const v = scoreOf[d.key].score;
    if ((d.key === "subject" && v < 7) || (d.key !== "subject" && v === 0)) {
      issues.push({ id: `img-${d.key}`, severity: d.severity, message: d.missing, suggestion: d.fix, technique: d.technique });
    }
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F",
    taskType: "image",
    wordCount: wc,
    dimensions,
    issues,
    strengths: dimensions.filter((d) => d.score >= 7).map((d) => `${d.label}: ${d.note}`),
    injectionRisk,
  };
}

// ---------- The needs to ask about for an image ----------
export const IMAGE_INTENT_FIELDS: { key: keyof Intent; label: string; question: string; placeholder: string }[] = [
  { key: "audience", label: "Use", question: "Where will you use it?", placeholder: "e.g. Instagram post" },
  { key: "goal", label: "Style", question: "What style?", placeholder: "e.g. watercolor painting" },
  { key: "length", label: "Shape", question: "What shape?", placeholder: "e.g. Landscape 16:9" },
  { key: "format", label: "Framing", question: "How should it be framed?", placeholder: "e.g. close-up from above" },
  { key: "tone", label: "Mood", question: "Mood and lighting?", placeholder: "e.g. warm golden hour" },
  { key: "notes", label: "Avoid", question: "Anything it must include or avoid?", placeholder: "e.g. no text, no people" },
];

export const IMAGE_PRESETS: IntentOptions = {
  audience: ["Instagram post", "Blog header", "Phone wallpaper"],
  goal: ["Photorealistic", "Watercolor painting", "3D render"],
  length: ["Square 1:1", "Landscape 16:9", "Portrait 9:16", "Portrait 4:5"],
  format: ["Close-up", "Wide shot", "From above"],
  tone: ["Warm golden hour", "Soft studio light", "Moody and dramatic"],
};

// Rendering size for a chosen shape (defaults to square).
export function sizeFor(shape: string | undefined): { width: number; height: number; label: string } {
  const m = shape?.match(/(\d+)\s*:\s*(\d+)/);
  if (!m) return { width: 1024, height: 1024, label: "1:1" };
  const [w, h] = [Number(m[1]), Number(m[2])];
  const scale = 1024 / Math.max(w, h);
  return { width: Math.round((w * scale) / 8) * 8, height: Math.round((h * scale) / 8) * 8, label: `${w}:${h}` };
}

// Free image generation, no API key: https://pollinations.ai
export function imageUrl(prompt: string, shape: string | undefined, seed: number, preview = false) {
  const { width, height } = sizeFor(shape);
  const k = preview ? 0.5 : 1;
  const q = new URLSearchParams({ width: String(Math.round(width * k)), height: String(Math.round(height * k)), seed: String(seed), nologo: "true" });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;
}

// Offline rewrite: subject first, then the confirmed needs, then neutral finish words.
export function optimizeImageOffline(prompt: string, intent?: Intent | null) {
  const a = analyzeImagePrompt(prompt);
  const dim = Object.fromEntries(a.dimensions.map((d) => [d.key, d.score]));
  const need = hasIntent(intent) ? intent : null;
  const parts: string[] = [prompt.trim().replace(/[.,\s]+$/, "")];
  const changes: { technique: string; description: string }[] = [];
  if (need?.goal.trim()) {
    parts.push(need.goal.trim().toLowerCase());
    changes.push({ technique: "Style and medium", description: `Added the style you chose: ${need.goal.trim()}.` });
  }
  if (need?.format.trim()) {
    parts.push(need.format.trim().toLowerCase());
    changes.push({ technique: "Composition and camera", description: `Added the framing you chose: ${need.format.trim()}.` });
  }
  if (need?.tone.trim()) {
    parts.push(need.tone.trim().toLowerCase());
    changes.push({ technique: "Lighting and mood", description: `Added the mood and lighting you chose: ${need.tone.trim()}.` });
  }
  if (need?.audience.trim()) {
    parts.push(`suitable for ${/^[aeiou]/i.test(need.audience.trim()) ? "an" : "a"} ${need.audience.trim().toLowerCase()}`);
    changes.push({ technique: "Composition and camera", description: `Aimed the composition at its use: ${need.audience.trim()}.` });
  }
  if (dim.detail === 0) {
    parts.push("sharp focus, high detail");
    changes.push({ technique: "Detail and quality", description: "Added neutral finish words: sharp focus, high detail." });
  }
  if (need?.notes.trim()) {
    const avoid = need.notes.trim().replace(/\.$/, "");
    parts.push(/^(no|without|avoid)\b/i.test(avoid) ? avoid.toLowerCase() : `without ${avoid.toLowerCase()}`);
    changes.push({ technique: "What to avoid", description: `Added what to avoid or include: ${avoid}.` });
  }
  return {
    optimizedPrompt: parts.join(", "),
    changes,
    rationale: need
      ? "Built from your subject and the style, framing, mood and exclusions you chose. The shape is applied when the image is rendered."
      : "No needs were confirmed, so only neutral finish words were added. Choosing a style and mood makes the biggest difference.",
    mode: "offline" as const,
  };
}

function hit(rx: RegExp, text: string, yes: string, no: string) {
  return rx.test(text) ? { score: 10, note: yes } : { score: 0, note: no };
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
