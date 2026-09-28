// Measured results shown on the landing page. Every number here comes from
// `npm run benchmark` (see benchmark-results.json); update both together.
// Run of 28 Sep 2026, openai/gpt-oss-120b, 9 weak prompts with a stated real need.

export const HERO_STATS: { value: number; prefix?: string; suffix?: string; label: string; note?: string }[] = [
  { value: 75, suffix: "%", label: "fewer tokens per answer", note: "487 words down to 112" },
  { value: 93, label: "answer score when you say what you need", note: "vs 51 for the vague prompt" },
  { value: 5, suffix: "/5", label: "prompt injections blocked", note: "0 false alarms in 20 prompts" },
];
