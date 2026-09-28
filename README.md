# PromptForge AI

An intelligent Generative AI platform that helps users **create, optimize and evaluate prompts** for Large Language Models (LLMs).

A vague prompt makes the model guess. PromptForge shows what your prompt leaves out, asks what you actually need (audience, purpose, length, format, tone), rewrites the prompt with proven techniques around those needs, then runs both versions and has a bias-corrected judge compare the answers against your stated needs.

**Live demo:** _add your Vercel link here_

![PromptForge home](docs/screenshots/01-home.png)

![Say what you need](docs/screenshots/10-needs.png)

![Comparison](docs/screenshots/09-live-compare.png)

## Features

| Step | What the user can do |
|------|----------------------|
| 1. Check | Score any prompt 0–100 on 8 weighted dimensions (clarity, specificity, context, role, output format, constraints, examples, structure), see a grade, the detected task type and a ranked list of issues with fixes. Optional AI critique from the LLM. |
| 2. Say what you need | Confirm who it is for, the purpose, length, format and tone, from suggested options or your own words. These needs drive the rewrite and are what both answers are judged against. |
| 3. Rewrite | Pick techniques (role prompting, context, chain-of-thought, output format, constraints, few-shot, delimiters) and get a rewritten prompt with a before/after score and a list of every change. The result is editable and re-scored live. |
| 4. Compare | Run both prompts on the same model. Each response is scored by an LLM judge on relevance, completeness, accuracy, clarity and instruction-following, plus rule-based checks (word limits, JSON validity, tables, code blocks, list counts, readability). |
| Iterate | Use the optimized prompt as the new starting point and repeat. |
| History | The last 20 optimizations are kept in the browser with their scores. |
| Guardrails | Prompt-injection patterns are detected, capped at a score of 20 and never optimized or executed. User text is always passed to the LLM as tagged data. |

PromptForge works in two modes:

- **Live AI**: with an API key, the LLM does the critique, rewrite, generation and judging.
- **Offline**: without a key, the rule-based analyzer and template optimizer still work, so the app is always usable.

## Tech stack

- **Next.js 15 (App Router) + React 19 + TypeScript**: UI and serverless API routes in one project, deploys to Vercel with zero config.
- **Groq API (`openai/gpt-oss-120b`)**: free tier and very fast responses. Any OpenAI-compatible API works by changing `LLM_BASE_URL` and `LLM_MODEL`.
- **Rule-based analyzer (TypeScript)**: deterministic, instant, works offline, and makes results reproducible for benchmarking.
- **Node.js test runner**: unit tests with no extra dependencies.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local   # then paste your Groq key into LLM_API_KEY (optional)
npm run dev                  # http://localhost:3000
```

Get a free Groq key at https://console.groq.com/keys. Without a key, the app runs in offline mode. Users can also paste their own key in **Settings**; it is stored only in their browser.

## Tests and benchmark

```bash
npm test            # 17 unit tests
npm run benchmark   # scores 20 labelled prompts + 5 injection attempts
```

With `LLM_API_KEY` set, the benchmark also optimizes the 10 weak prompts with their real needs, runs both versions, and compares the answers head to head in both orders, against the real need and against the bare request. Results are written to `benchmark-results.json`.

## Architecture

![Architecture](docs/screenshots/00-architecture.png)

## Results

Live run on Groq `openai/gpt-oss-120b`, 9 weak prompts, each with a hand-written real need (`npm run benchmark`):

| | Vague prompt | PromptForge prompt |
|---|---|---|
| Judge score against the real need | 51.2 | **92.7** (9 of 9 wins) |
| Judge score against the vague request | 85.1 | 80.1 |
| Met the requested word limit | 2 of 9 | 7 of 9 |
| Average answer length | 487 words | 112 words (−77%) |
| Output tokens / latency | 778 / 3.7 s | 197 / 2.0 s |

Judged against a vague request, a long generic answer looks fine. Judged against what the person actually needed, it loses every time. That is why PromptForge asks what you need before it rewrites anything.

Analyzer: 95% weak vs strong classification on 20 labelled prompts, 5/5 prompt injections detected with 0 false positives, about 1 ms per analysis.

### How answers are compared

Both answers go to one judge call and are scored against the **same target**: your original request plus the needs you confirmed, on relevance, completeness, accuracy, clarity, conciseness and instruction following. Each pair is judged twice with the order swapped, because LLM judges favour whichever answer they read first. The winner is decided from the averaged criterion scores, not the judge's free-choice pick (which leans towards longer answers), and only when both orders agree.

## Project structure

```
app/
  page.tsx               UI: check → needs → rewrite → compare workflow
  api/analyze/route.ts   rule-based analysis + optional AI critique
  api/optimize/route.ts  LLM rewrite, falls back to templates
  api/generate/route.ts  runs a prompt on the LLM
  api/intent/route.ts    suggests likely needs for a prompt
  api/evaluate/route.ts  LLM judge + rule checks for a single answer
  api/compare/route.ts   head-to-head judge of two answers (one order per call)
  api/status/route.ts    reports whether a server key is configured
lib/
  analyzer.ts            8-dimension scoring, issues, task type, injection detection
  optimizer.ts           offline template optimizer and technique list
  metrics.ts             response checks (word limit, JSON, table, readability…)
  judge.ts               pairwise judge, both-order combining, bias handling
  intent.ts              needs model, presets, the judging yardstick
  llm.ts                 OpenAI-compatible client + tolerant JSON parser
  prompts.ts             system prompts for critic, optimizer and judge
tests/                   unit tests
scripts/benchmark.ts     evaluation script
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. On https://vercel.com/new, import the repository (framework is detected automatically).
3. Add the environment variable `LLM_API_KEY` with your Groq key.
4. Deploy.

## Security

No API keys are stored in this repository. `.env.local` is git-ignored.
