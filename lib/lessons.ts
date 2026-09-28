// Short lessons shown in "Learning" mode and in the downloadable report.
// Keys match analyzer dimension keys, optimizer technique names and image elements.

export interface Lesson {
  title: string;
  what: string;
  why: string;
  before: string;
  after: string;
}

export const LESSONS: Record<string, Lesson> = {
  clarity: {
    title: "Clear instruction",
    what: "Start with one direct action: explain, write, compare, list.",
    why: "The model knows immediately what kind of output to produce, so less of the answer is spent guessing.",
    before: "machine learning stuff",
    after: "Explain what machine learning is.",
  },
  specificity: {
    title: "Specificity",
    what: "Replace vague words with concrete details: names, numbers, criteria.",
    why: "Vague words like \"good\" or \"some\" force the model to pick a meaning for you, often not yours.",
    before: "Write something good for my bakery.",
    after: "Write a 40-word Instagram caption for our new chocolate croissant.",
  },
  context: {
    title: "Context setting",
    what: "Say who the answer is for and why you need it.",
    why: "The same topic needs a different answer for a child, a student or an engineer. Context picks the right one.",
    before: "Explain blockchain.",
    after: "Explain blockchain to my grandmother, who wants to know why people talk about it.",
  },
  role: {
    title: "Role prompting",
    what: "Give the model an expert persona that fits the task.",
    why: "A role sets vocabulary, depth and standards, for example a teacher simplifies while a reviewer critiques.",
    before: "Check my code.",
    after: "You are a senior Python reviewer. Check my code for bugs and readability.",
  },
  format: {
    title: "Output format",
    what: "Describe the exact shape of the answer: bullets, a table, JSON, N paragraphs.",
    why: "Without a format the model chooses one, usually a long essay. A stated format is easy to check and reuse.",
    before: "Compare React and Vue.",
    after: "Compare React and Vue in a table with 4 rows, then give a one-line recommendation.",
  },
  constraints: {
    title: "Constraints",
    what: "Set limits on length, tone and scope.",
    why: "Limits stop padding and keep the answer on target. Only add limits you actually want.",
    before: "Write an email asking for leave.",
    after: "Write a polite, formal email asking for leave, under 120 words.",
  },
  examples: {
    title: "Few-shot examples",
    what: "Show a short example of the output you want.",
    why: "An example communicates style and format faster than a description.",
    before: "Write product taglines.",
    after: "Write 3 product taglines in this style: \"Fresh out of the oven, gone by noon.\"",
  },
  structure: {
    title: "Structure and delimiters",
    what: "Separate instructions, context and data with headings or triple quotes.",
    why: "The model can tell what to do apart from what to work on, which matters for long prompts.",
    before: "Summarize this I am a student it is for an exam text here...",
    after: "### Task\nSummarize the text for exam revision.\n### Text\n\"\"\"...\"\"\"",
  },
  cot: {
    title: "Chain-of-thought",
    what: "Ask the model to reason step by step before the final answer.",
    why: "For reasoning tasks, writing out steps reduces mistakes. Skip it for simple writing tasks.",
    before: "Which plan is cheaper?",
    after: "Work through the costs of each plan step by step, then say which is cheaper.",
  },
  // Image prompts
  subject: {
    title: "Subject",
    what: "Name the main subject clearly, with key details: what it is, what it is doing, where.",
    why: "Image models draw what is named. Unnamed details are filled with random defaults.",
    before: "a dog",
    after: "a golden retriever puppy sitting on a red blanket in a sunny garden",
  },
  style: {
    title: "Style and medium",
    what: "Say what it should look like, and put it first: \"a watercolor painting of ...\", \"a studio photo of ...\".",
    why: "Style changes the whole image more than any other word, and image models follow it much better when it leads the prompt with a few texture words.",
    before: "a mountain lake, watercolor",
    after: "a watercolor painting of a mountain lake, soft washes of color, visible paper texture",
  },
  composition: {
    title: "Composition and camera",
    what: "Describe framing and viewpoint: close-up, wide shot, from above, centered.",
    why: "Framing decides what fills the image and what gets cut off.",
    before: "a coffee cup",
    after: "a coffee cup, close-up, shot from above, centered on a wooden table",
  },
  lighting: {
    title: "Lighting and mood",
    what: "Describe the light and feeling: golden hour, soft studio light, moody, bright.",
    why: "Light sets the mood; without it images often look flat.",
    before: "a city street",
    after: "a city street at golden hour, warm light, long shadows, calm mood",
  },
  color: {
    title: "Color palette",
    what: "Name the colors or palette you want.",
    why: "A palette makes images consistent with a brand or a series.",
    before: "a poster of a rocket",
    after: "a poster of a rocket, navy and orange palette",
  },
  detail: {
    title: "Detail and quality",
    what: "Add a few words about detail and finish: sharp focus, highly detailed, clean background.",
    why: "Helps the model aim for a finished result instead of a sketch, as long as it is not overdone.",
    before: "a watch",
    after: "a watch, sharp focus, highly detailed, clean white background",
  },
  aspect: {
    title: "Aspect ratio",
    what: "Choose the shape: square for posts, wide for banners, tall for phone screens.",
    why: "The shape changes the composition; a banner and a phone wallpaper need different layouts.",
    before: "(no shape given)",
    after: "Landscape 16:9 for a blog header",
  },
  negative: {
    title: "What to avoid",
    what: "Say what must not appear: text, watermarks, extra fingers, clutter.",
    why: "Stops common mistakes and unwanted elements.",
    before: "a product photo",
    after: "a product photo, no text, no people, uncluttered background",
  },
};

// Map an issue's technique label (from the analyzers) to a lesson key.
export const TEXT_LESSONS = ["clarity", "specificity", "context", "role", "format", "constraints", "examples", "structure", "cot"];
export const IMAGE_LESSONS = ["subject", "style", "composition", "lighting", "color", "detail", "aspect", "negative"];

const TECHNIQUE_TO_LESSON: Record<string, string> = {
  "Clear instruction": "clarity",
  Specificity: "specificity",
  "Context setting": "context",
  "Role prompting": "role",
  "Output formatting": "format",
  Constraints: "constraints",
  "Few-shot prompting": "examples",
  Delimiters: "structure",
  "Task decomposition": "structure",
  "Chain-of-thought": "cot",
  Subject: "subject",
  "Style and medium": "style",
  "Composition and camera": "composition",
  "Lighting and mood": "lighting",
  "Color palette": "color",
  "Detail and quality": "detail",
  "Aspect ratio": "aspect",
  "What to avoid": "negative",
};

export function lessonFor(technique: string): Lesson | null {
  const key = TECHNIQUE_TO_LESSON[technique] ?? Object.keys(LESSONS).find((k) => LESSONS[k].title === technique);
  return key ? LESSONS[key] : null;
}
