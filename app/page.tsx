"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzePrompt, type Analysis } from "../lib/analyzer";
import { TECHNIQUES, type TechniqueId, type Change } from "../lib/optimizer";
import type { ResponseMetrics } from "../lib/metrics";
import { IMAGE_SAMPLES, SAMPLE_PROMPTS } from "../lib/templates";
import { Bar, CountUp, Icon, Logo, ScoreRing, SeverityTag, Spinner, scoreColor, scoreTone } from "../components/ui";
import { Hero, type HeroDemo } from "../components/Hero";
import { EMPTY_INTENT, INTENT_FIELDS, hasIntent, intentStatement, type Intent, type IntentOptions } from "../lib/intent";
import { combineVerdicts, type PairwiseResult } from "../lib/judge";
import { IMAGE_INTENT_FIELDS, analyzeImagePrompt, sizeFor, type ImageAnalysis } from "../lib/image";
import { lessonFor, type Lesson } from "../lib/lessons";
import { estimateTokens, imageSnippet, textSnippet, type SnippetLang } from "../lib/snippets";
import { buildReportHtml, reportFileName, type ReportData } from "../lib/report";

interface Critique { summary?: string; strengths?: string[]; weaknesses?: string[]; suggestions?: string[] }
interface OptResult { optimizedPrompt: string; changes: Change[]; rationale: string; mode: "llm" | "offline"; before: number; after: number; warning?: string }
interface Judge { scores: Record<string, number>; overall: number; feedback: string; improvements: string[] }
interface EvalResult { metrics: ResponseMetrics; judge: Judge | null; warning?: string }
interface RunResult { response: string; latencyMs: number; tokens?: { prompt: number; completion: number }; evaluation: EvalResult }
type Pass = PairwiseResult & { metrics: { original: ResponseMetrics; optimized: ResponseMetrics } };
interface Runs { original: RunResult; optimized: RunResult; winner: PairwiseResult["winner"]; reason: string; consistent: boolean; intentUsed: boolean }
interface HistoryItem { id: string; at: number; original: string; optimized: string; before: number; after: number; evalOriginal?: number; evalOptimized?: number; kind?: Kind }
type PromptAnalysis = Analysis | ImageAnalysis;
type Kind = "text" | "image";
type Audience = "beginner" | "learner" | "developer";

const KEY_STORE = "pf_user_key";
const HISTORY_STORE = "pf_history";
const MODE_STORE = "pf_mode";
const IMAGE_KEY_STORE = "pf_image_key";
const DEFAULT_TECHNIQUES: TechniqueId[] = ["role", "context", "cot", "format", "constraints", "delimiters"];
const CRITERIA_LABELS: Record<string, string> = {
  relevance: "Relevance",
  completeness: "Completeness",
  accuracy: "Accuracy",
  clarity: "Clarity",
  conciseness: "Conciseness",
  instruction_following: "Instruction following",
};
const AUDIENCES: { id: Audience; label: string; blurb: string }[] = [
  { id: "beginner", label: "New to prompting", blurb: "Plain language, one button to improve" },
  { id: "learner", label: "Learning", blurb: "A short lesson for every issue and change" },
  { id: "developer", label: "Developer", blurb: "Code snippets, tokens and JSON export" },
];
const STEPS = ["Check", "Needs", "Rewrite", "Compare", "Summary"];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Home() {
  const [status, setStatus] = useState<{ serverKey: boolean; imageKey?: boolean; model: string } | null>(null);
  const [userKey, setUserKey] = useState("");
  const [imageKey, setImageKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keysTab, setKeysTab] = useState<"text" | "image">("text");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [audience, setAudience] = useState<Audience>("beginner");
  const [kind, setKind] = useState<Kind>("text");

  const [prompt, setPrompt] = useState("");
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [critique, setCritique] = useState<Critique | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [techniques, setTechniques] = useState<TechniqueId[]>(DEFAULT_TECHNIQUES);
  const [opt, setOpt] = useState<OptResult | null>(null);
  const [optText, setOptText] = useState("");
  const [optimizing, setOptimizing] = useState(false);

  // What the user actually needs. Confirmed needs drive the rewrite and are the
  // yardstick both answers are judged against.
  const [intent, setIntent] = useState<Intent>(EMPTY_INTENT);
  const [intentOptions, setIntentOptions] = useState<IntentOptions | null>(null);
  const [intentDone, setIntentDone] = useState<"confirmed" | "skipped" | null>(null);

  const [runs, setRuns] = useState<Runs | null>(null);
  const [running, setRunning] = useState(false);
  const [manualResponse, setManualResponse] = useState("");
  const [manualEval, setManualEval] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Image comparison: both prompts rendered with the same seed and shape, one after
  // the other (the free image service handles one request at a time). Images are
  // kept as data URLs so the downloaded report still shows them offline.
  const [seed, setSeed] = useState(0);
  const [images, setImages] = useState<{ a?: string; b?: string }>({});
  const [imgBusy, setImgBusy] = useState<"a" | "b" | null>(null);

  // The deck: one card per step; the card flips when the step changes.
  const [view, setView] = useState(0);
  const [dir, setDir] = useState(1);

  // Presentation-only state
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const deckRef = useRef<HTMLOListElement>(null);
  const belowRef = useRef<HTMLDivElement>(null);
  const dotsIdle = useRef(0);

  // Page background below the hero: dots near the pointer light up, like the hero sky.
  function dotsMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = belowRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", `${Math.round(e.clientX - r.left)}px`);
    el.style.setProperty("--py", `${Math.round(e.clientY - r.top)}px`);
    el.classList.add("dots-on");
    window.clearTimeout(dotsIdle.current);
    dotsIdle.current = window.setTimeout(() => el.classList.remove("dots-on"), 1800);
  }
  function dotsLeave() {
    window.clearTimeout(dotsIdle.current);
    belowRef.current?.classList.remove("dots-on");
  }

  useEffect(() => {
    setUserKey(load(KEY_STORE, ""));
    setImageKey(load(IMAGE_KEY_STORE, ""));
    setHistory(load(HISTORY_STORE, []));
    setAudience(load(MODE_STORE, "beginner"));
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ serverKey: false, model: "" }));
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      // Page scroll progress drives the thin line under the navigation bar.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty("--page-sp", (max > 0 ? window.scrollY / max : 0).toFixed(4));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const live = Boolean(status?.serverKey || userKey);
  const scoreOf = (text: string): PromptAnalysis => (kind === "image" ? analyzeImagePrompt(text) : analyzePrompt(text));
  const optLive = useMemo(() => (optText.trim() ? scoreOf(optText) : null), [optText, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirmedIntent = intentDone === "confirmed" && hasIntent(intent) ? intent : null;
  const canOptimize = Boolean(analysis && !analysis.injectionRisk);
  const fields = kind === "image" ? IMAGE_INTENT_FIELDS : INTENT_FIELDS;
  const done = [Boolean(analysis), Boolean(intentDone), Boolean(opt), Boolean(runs || (kind === "image" && images.b)), false];
  const reachable = [true, canOptimize, Boolean(intentDone), Boolean(opt), Boolean(opt)];
  const shape = kind === "image" ? confirmedIntent?.length : undefined;

  // The hero cards tell the before-to-after story. Before the user does anything
  // they show an example; afterwards they reflect the user's own prompt and results.
  const heroDemo: HeroDemo = useMemo(() => {
    if (!analysis) {
      return {
        prompt: "explain machine learning",
        guesses: ["Who is it for?", "How long?", "What format?"],
        needs: ["For a beginner", "Under 100 words", "Bullet points", "Friendly tone"],
        outcome: null,
        live: false,
      };
    }
    const ids = new Set(analysis.issues.map((i) => i.id));
    const guesses = (kind === "image"
      ? [ids.has("img-style") && "What style?", ids.has("img-lighting") && "What light?", ids.has("img-composition") && "What framing?", ids.has("img-subject") && "What exactly?"]
      : [
          ids.has("no-context") && "Who is it for?",
          (ids.has("no-constraints") || ids.has("too-short")) && "How long?",
          ids.has("no-format") && "What format?",
          ids.has("vague") && "What does good mean?",
        ]
    ).filter((x): x is string => Boolean(x));
    const needs = confirmedIntent
      ? (kind === "image"
          ? [confirmedIntent.goal, confirmedIntent.length, confirmedIntent.format, confirmedIntent.tone]
          : [confirmedIntent.audience && `For ${lowerFirst(confirmedIntent.audience)}`, confirmedIntent.length, confirmedIntent.format, confirmedIntent.tone]
        )
          .filter((x): x is string => Boolean(x && x.trim()))
          .map((x) => (x.length > 28 ? `${x.slice(0, 26)}…` : x))
      : [];
    const outcome = runs ? (runs.winner === "optimized" ? "better" : runs.winner === "tie" ? "close" : "worse") : null;
    return { prompt: prompt.length > 70 ? `${prompt.slice(0, 68)}…` : prompt, guesses: guesses.slice(0, 3), needs, outcome, live: true };
  }, [analysis, confirmedIntent, runs, prompt, kind]);

  async function api<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(userKey ? { "x-user-api-key": userKey } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data as T;
  }

  function goView(v: number, scroll = true) {
    setDir(v >= view ? 1 : -1);
    setView(v);
    if (scroll) requestAnimationFrame(() => deckRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function resetDownstream() {
    setOpt(null);
    setOptText("");
    setRuns(null);
    setManualEval(null);
    setWarning(null);
    setError(null);
    setSeed(0);
    setImages({});
  }

  async function analyze(text = prompt, k: Kind = kind) {
    if (!text.trim()) return;
    setAnalyzing(true);
    resetDownstream();
    setCritique(null);
    try {
      const r = await api<{ analysis: PromptAnalysis; critique: Critique | null; warning?: string }>("/api/analyze", { prompt: text, kind: k });
      setAnalysis(r.analysis);
      setCritique(r.critique);
      setIntent(EMPTY_INTENT);
      setIntentDone(null);
      setIntentOptions(null);
      if (!r.analysis.injectionRisk) {
        api<{ options: IntentOptions }>("/api/intent", { prompt: text, kind: k })
          .then((o) => setIntentOptions(o.options))
          .catch(() => setIntentOptions(null));
      }
      if (r.warning) setWarning(r.warning);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function optimize() {
    setOptimizing(true);
    setRuns(null);
    setSeed(0);
    setError(null);
    try {
      const r = await api<OptResult>("/api/optimize", { prompt, techniques, intent: confirmedIntent, kind });
      setOpt(r);
      setOptText(r.optimizedPrompt);
      if (r.warning) setWarning(r.warning);
      pushHistory({ original: prompt, optimized: r.optimizedPrompt, before: r.before, after: r.after, kind });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOptimizing(false);
    }
  }

  async function generate(p: string) {
    // Low temperature so the two answers differ because of the prompt, not random sampling.
    return api<{ text: string; latencyMs: number; tokens?: RunResult["tokens"] }>("/api/generate", { prompt: p, temperature: 0.3 });
  }

  async function runComparison() {
    setRunning(true);
    setError(null);
    try {
      // Sequential rather than parallel: free-tier keys have a low tokens-per-minute limit.
      const a = await generate(prompt);
      const b = await generate(optText);
      // Head-to-head judging against the stated needs, once in each order to cancel position bias.
      const body = { originalPrompt: prompt, optimizedPrompt: optText, originalAnswer: a.text, optimizedAnswer: b.text, intent: confirmedIntent };
      const p1 = await api<Pass>("/api/compare", { ...body, swap: false });
      const p2 = await api<Pass>("/api/compare", { ...body, swap: true });
      const v = { ...combineVerdicts(p1, p2), metrics: p1.metrics };
      const original: RunResult = { response: a.text, latencyMs: a.latencyMs, tokens: a.tokens, evaluation: { metrics: v.metrics.original, judge: { ...v.original, improvements: [] } } };
      const optimized: RunResult = { response: b.text, latencyMs: b.latencyMs, tokens: b.tokens, evaluation: { metrics: v.metrics.optimized, judge: { ...v.optimized, improvements: [] } } };
      setRuns({ original, optimized, winner: v.winner, reason: v.reason, consistent: v.consistent, intentUsed: Boolean(confirmedIntent) });
      setHistory((h) => {
        const next = h.map((item, i) =>
          i === 0 && item.optimized === optText ? { ...item, evalOriginal: v.original.overall, evalOptimized: v.optimized.overall } : item,
        );
        save(HISTORY_STORE, next);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function fetchImage(p: string, s: number): Promise<string> {
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(imageKey ? { "x-image-key": imageKey } : {}) },
      body: JSON.stringify({ prompt: p, shape, seed: s }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Image request failed (${res.status})`);
    }
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Could not read the image."));
      r.readAsDataURL(blob);
    });
  }

  async function renderImages() {
    const s = Math.floor(Math.random() * 90000) + 1000;
    setSeed(s);
    setImages({});
    setError(null);
    try {
      setImgBusy("a");
      const a = await fetchImage(prompt, s);
      setImages({ a });
      setImgBusy("b");
      const b = await fetchImage(optText, s);
      setImages({ a, b });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImgBusy(null);
    }
  }

  async function evaluateManual() {
    setError(null);
    try {
      setManualEval(await api<EvalResult>("/api/evaluate", { prompt: optText || prompt, response: manualResponse }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function pushHistory(item: Omit<HistoryItem, "id" | "at">) {
    setHistory((h) => {
      const next = [{ ...item, id: crypto.randomUUID(), at: Date.now() }, ...h].slice(0, 20);
      save(HISTORY_STORE, next);
      return next;
    });
  }

  function switchKind(k: Kind) {
    if (k === kind) return;
    setKind(k);
    setPrompt("");
    setAnalysis(null);
    setCritique(null);
    setIntent(EMPTY_INTENT);
    setIntentDone(null);
    setIntentOptions(null);
    resetDownstream();
    goView(0, false);
  }

  function loadPrompt(p: string, k: Kind = kind) {
    if (k !== kind) setKind(k);
    setPrompt(p);
    setAnalysis(null);
    setCritique(null);
    resetDownstream();
    analyze(p, k);
    goView(0);
  }

  function iterate() {
    setPrompt(optText);
    analyze(optText);
    goView(0);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  function setNeed(key: keyof Intent, value: string) {
    setIntent((i) => ({ ...i, [key]: value }));
    if (intentDone) {
      setIntentDone(null);
      setOpt(null);
      setOptText("");
      setRuns(null);
      setSeed(0);
    }
  }

  function finishIntent(mode: "confirmed" | "skipped") {
    if (mode === "skipped") setIntent(EMPTY_INTENT);
    setIntentDone(mode);
    goView(2);
  }

  function openKeys(tab: "text" | "image") {
    setKeysTab(tab);
    setShowSettings(true);
  }

  function chooseAudience(a: Audience) {
    setAudience(a);
    save(MODE_STORE, a);
  }

  // Hero cards: 0 = the prompt, 1 = the needs, 2 = the answers. Before any analysis
  // the first card runs the example; afterwards each card opens its step.
  function openFromHero(card: 0 | 1 | 2) {
    if (!analysis) return loadPrompt(heroDemo.prompt, "text");
    if (card === 2 && opt) goView(3);
    else if (card >= 1 && canOptimize) goView(1);
    else goView(0);
  }

  const toggle = (id: TechniqueId) =>
    setTechniques((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  function reportData(): ReportData {
    const needs = confirmedIntent
      ? fields.filter((f) => confirmedIntent[f.key]?.trim()).map((f) => ({ label: f.label, value: confirmedIntent[f.key].trim() }))
      : [];
    const side = (r: RunResult) => ({
      overall: r.evaluation.judge?.overall ?? 0,
      scores: r.evaluation.judge?.scores ?? {},
      feedback: r.evaluation.judge?.feedback ?? "",
      words: r.evaluation.metrics.wordCount,
      tokens: r.tokens?.completion,
      latencyMs: r.latencyMs,
      checks: r.evaluation.metrics.checks,
      answer: r.response,
    });
    return {
      kind,
      audience: AUDIENCES.find((a) => a.id === audience)!.label,
      createdAt: new Date().toISOString(),
      model: status?.model ?? "",
      live,
      prompt,
      analysis: analysis!,
      needs,
      optimized: opt ? { prompt: optText, before: opt.before, after: optLive?.score ?? opt.after, changes: opt.changes, rationale: opt.rationale, mode: opt.mode } : undefined,
      comparison: runs
        ? { winner: runs.winner, reason: runs.reason, consistent: runs.consistent, judgedAgainst: runs.intentUsed ? "your stated needs" : "your original request", original: side(runs.original), optimized: side(runs.optimized) }
        : undefined,
      images: kind === "image" && images.a && images.b ? { originalUrl: images.a, optimizedUrl: images.b, seed, shape: sizeFor(shape).label } : undefined,
    };
  }
  function downloadReport() {
    const d = reportData();
    download(reportFileName(d, "html"), buildReportHtml(d), "text/html");
  }
  function openPrintable() {
    const url = URL.createObjectURL(new Blob([buildReportHtml(reportData())], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  function downloadJson() {
    const d = reportData();
    download(reportFileName(d, "json"), JSON.stringify(d, null, 2), "application/json");
  }

  const learner = audience === "learner";
  const developer = audience === "developer";
  const beginner = audience === "beginner";
  const samples = kind === "image" ? IMAGE_SAMPLES : SAMPLE_PROMPTS;

  return (
    <>
      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-left">
          <a className="logo" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <Logo /> PromptForge
          </a>
          <nav className="nav-links" aria-label="Workflow">
            {STEPS.map((s, i) => (
              <button key={s} className={`nav-link ${view === i ? "active" : ""}`} disabled={!reachable[i]} onClick={() => goView(i)}>{s}</button>
            ))}
          </nav>
        </div>
        <div className="nav-right">
          {status && (
            <span className={`status ${live ? "live" : ""}`} title={live ? `Model: ${status.model}` : "Rule-based analysis and template optimizer only"}>
              <span className="dot" />
              <span className="status-text">{live ? "Live AI" : "Offline mode"}</span>
            </span>
          )}
          <button className="btn sm" onClick={() => setShowSettings(true)}>
            <Icon.key /> Keys
          </button>
        </div>
      </header>

      <Hero onCheck={(t) => loadPrompt(t)} onOpen={openFromHero} samples={SAMPLE_PROMPTS.filter((x) => x.prompt.length <= 45).slice(0, 3)} demo={heroDemo} />

      <div className="below" ref={belowRef} onPointerMove={dotsMove} onPointerLeave={dotsLeave}>
      <div className="page-bg" aria-hidden>
        <div className="pdots" />
        <div className="pdots-lit" />
        <div className="pglow g1" />
        <div className="pglow g2" />
        <div className="pglow g3" />
      </div>
      <div className="workspace">
        <main>
          <div className="deck-head">
            <div className="modes" role="radiogroup" aria-label="Who is this for">
              {AUDIENCES.map((a) => (
                <button key={a.id} role="radio" aria-checked={audience === a.id} className={`mode ${audience === a.id ? "on" : ""}`} onClick={() => chooseAudience(a.id)} title={a.blurb}>
                  <b>{a.label}</b>
                  <span>{a.blurb}</span>
                </button>
              ))}
            </div>
            <div className="kind" role="radiogroup" aria-label="Prompt type">
              {(["text", "image"] as const).map((k) => (
                <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => switchKind(k)}>
                  {k === "text" ? "Text prompt" : "Image prompt"}
                </button>
              ))}
            </div>
          </div>

          <ol className="stepper" ref={deckRef}>
            {STEPS.map((s, i) => (
              <li key={s} className={`${view === i ? "current" : ""} ${done[i] ? "done" : ""}`}>
                <button disabled={!reachable[i]} onClick={() => goView(i)}>
                  <span className="n">{done[i] && view !== i ? <Icon.check size={12} /> : String(i + 1).padStart(2, "0")}</span>
                  {s}
                </button>
              </li>
            ))}
          </ol>

          <div className="deck">
            <section key={`${view}-${kind}`} className={`flipcard ${dir > 0 ? "fwd" : "back"}`} aria-live="polite">
              {/* ---------- 1. Check ---------- */}
              {view === 0 && (
                <div className="panel" id="analyze">
                  <div className="panel-head">
                    <h3>{kind === "image" ? "Describe the image you want" : beginner ? "Type what you want to ask an AI" : "Write your prompt"}</h3>
                    <span className="hint">
                      {beginner ? "We'll show what's missing, in plain words" : learner ? "Scored on the skills good prompts use" : "Rule-based score in about 1 ms, no key needed"}
                    </span>
                  </div>
                  <div className="editor-wrap">
                    <textarea
                      ref={editorRef}
                      className="editor"
                      value={prompt}
                      maxLength={6000}
                      placeholder={kind === "image" ? "e.g. a cat" : "e.g. explain machine learning"}
                      aria-label="Prompt"
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
                      }}
                    />
                    <div className="editor-bar">
                      <span className="kbd"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to check</span>
                      <div className="row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="counter">{developer ? `~${estimateTokens(prompt)} tokens · ` : ""}{prompt.length.toLocaleString()} / 6,000</span>
                        <button className="btn primary" disabled={!prompt.trim() || analyzing} onClick={() => analyze()}>
                          {analyzing ? <Spinner /> : null} {analyzing ? "Checking" : "Check prompt"}
                        </button>
                      </div>
                    </div>
                  </div>
                  {!analysis && !analyzing && (
                    <div className="try-samples" style={{ marginTop: 16 }}>
                      <span>Try</span>
                      {samples.slice(0, 4).map((s) => (
                        <button key={s.title} className="chip" onClick={() => loadPrompt(s.prompt)}>{s.prompt.length > 30 ? `${s.prompt.slice(0, 28)}…` : s.prompt}</button>
                      ))}
                    </div>
                  )}

                  {analyzing && !analysis && <AnalysisSkeleton />}

                  {analysis && (
                    <div key={analysis.score + analysis.wordCount} style={{ marginTop: 32 }}>
                      <div className="analysis">
                        <div className="score-box">
                          <ScoreRing score={analysis.score} />
                          <p className="score-caption">
                            {kind === "image" ? "How fully the prompt describes the image. A low score means the model fills in the gaps." : "How clearly the prompt says what you want. A low score means the model has to guess."}
                          </p>
                          <div className="score-meta">
                            <span className={`tag ${scoreTone(analysis.score)}`}>Grade {analysis.grade}</span>
                            <span className="tag">{analysis.taskType}</span>
                            <span className="tag">{analysis.wordCount} words</span>
                          </div>
                        </div>
                        <div className="bars">
                          {analysis.dimensions.map((d, i) => (
                            <Bar key={d.key} index={i} label={d.label} value={d.score} hint={`${d.note} (weight ${d.weight}%)`} />
                          ))}
                        </div>
                      </div>

                      {analysis.injectionRisk && (
                        <div className="notice bad">
                          <Icon.alert />
                          <span>Prompt-injection pattern detected. PromptForge will not optimize or run instructions that try to override system rules.</span>
                        </div>
                      )}

                      {analysis.issues.length > 0 && (
                        <>
                          <div className="subhead">{beginner ? "What's missing" : "Issues found"} <span className="tag">{analysis.issues.length}</span></div>
                          <ul className="issues">
                            {(beginner ? analysis.issues.slice(0, 4) : analysis.issues).map((i, idx) => {
                              const lesson = lessonFor(i.technique);
                              return (
                                <li className="issue" key={i.id} style={{ "--i": idx } as React.CSSProperties}>
                                  <SeverityTag severity={i.severity} />
                                  <div>
                                    {!beginner && <div className="tech">{i.technique}</div>}
                                    <div className="msg">{beginner ? i.suggestion : i.message}</div>
                                    {!beginner && <div className="fix">{i.suggestion}</div>}
                                    {learner && lesson && <LessonBox lesson={lesson} />}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}

                      {critique && !beginner && (
                        <div className="critique">
                          <div className="subhead" style={{ margin: "0 0 8px" }}>AI critique</div>
                          {critique.summary && <p>{critique.summary}</p>}
                          {!!critique.weaknesses?.length && (<><div className="label">Weaknesses</div><ul>{critique.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul></>)}
                          {!!critique.suggestions?.length && (<><div className="label">Suggestions</div><ul>{critique.suggestions.map((w, i) => <li key={i}>{w}</li>)}</ul></>)}
                        </div>
                      )}

                      {canOptimize && (
                        <div className="actions end">
                          <button className="btn primary" onClick={() => goView(1)}>Next: say what you need <Icon.arrow /></button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ---------- 2. Needs ---------- */}
              {view === 1 && canOptimize && (
                <div className="panel" id="needs">
                  <div className="panel-head">
                    <h3>{kind === "image" ? "Describe the look you want" : "Say what you need"}</h3>
                    <span className="hint">{kind === "image" ? "Pick an option or type your own." : "The model cannot guess these. Pick an option or type your own."}</span>
                  </div>
                  {learner && (
                    <p className="learn-note">
                      {kind === "image"
                        ? "Image models draw what you name. Style, framing and light change the result more than anything else."
                        : "Most weak answers come from missing context: who it is for, how long, and in what format. Stating them is the single biggest improvement."}
                    </p>
                  )}
                  <div className="needs">
                    {fields.map((f) => {
                      const options = f.key === "notes" ? [] : intentOptions?.[f.key] ?? [];
                      return (
                        <div className="need" key={f.key}>
                          <label className="need-q" htmlFor={`need-${f.key}`}>{f.question}</label>
                          {options.length > 0 && (
                            <div className="chips need-chips">
                              {options.map((o) => {
                                const on = intent[f.key] === o;
                                return (
                                  <button key={o} className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setNeed(f.key, on ? "" : o)}>
                                    <span className="tick"><Icon.check size={10} /></span>
                                    {o}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {f.key !== "notes" && !intentOptions && <div className="skeleton shimmer" style={{ width: 260, height: 34, borderRadius: 999 }} />}
                          {f.key === "notes" ? (
                            <input id={`need-${f.key}`} className="field need-input" placeholder={f.placeholder} value={intent.notes} onChange={(e) => setNeed("notes", e.target.value)} />
                          ) : (
                            <input
                              id={`need-${f.key}`}
                              className={`chip-input ${intent[f.key] && !options.includes(intent[f.key]) ? "on" : ""}`}
                              placeholder="Or type your own"
                              value={options.includes(intent[f.key]) ? "" : intent[f.key]}
                              onChange={(e) => setNeed(f.key, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {hasIntent(intent) && kind === "text" && (
                    <div className="needs-preview">
                      <span className="label">What both answers will be judged against</span>
                      <div className="pane-body">{intentStatement(prompt, intent)}</div>
                    </div>
                  )}
                  <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <button className="btn ghost" onClick={() => finishIntent("skipped")}>Skip, keep it open</button>
                    <button className="btn primary" disabled={!hasIntent(intent)} onClick={() => finishIntent("confirmed")}>
                      Confirm and continue <Icon.arrow />
                    </button>
                  </div>
                </div>
              )}

              {/* ---------- 3. Rewrite ---------- */}
              {view === 2 && canOptimize && intentDone && (
                <div className="panel" id="optimize">
                  <div className="panel-head">
                    <h3>{kind === "image" ? "Rewrite the image prompt" : beginner ? "Improve your prompt" : "Choose techniques"}</h3>
                    <span className="hint">{live ? "Rewritten by the LLM" : "Rewritten with offline templates"}</span>
                  </div>
                  {intentDone === "skipped" && (
                    <div className="notice info" style={{ marginTop: 0, marginBottom: 16 }}>
                      <Icon.alert />
                      <span>No needs confirmed, so the rewrite can only add structure. <button className="linklike" onClick={() => goView(1)}>Add needs</button></span>
                    </div>
                  )}
                  {kind === "text" &&
                    (beginner ? (
                      <details className="disclose" style={{ marginTop: 0 }}>
                        <summary><Icon.chevron /> Advanced: choose techniques ({techniques.length} on)</summary>
                        <div><TechniqueChips techniques={techniques} toggle={toggle} /></div>
                      </details>
                    ) : (
                      <TechniqueChips techniques={techniques} toggle={toggle} learner={learner} />
                    ))}
                  <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="hint" style={{ fontSize: 13, color: "var(--muted)" }}>
                      {kind === "image" ? "Keeps your subject; adds the style, framing and mood you chose" : `${techniques.length} of ${TECHNIQUES.length} techniques`}
                    </span>
                    <button className="btn primary" disabled={optimizing || (kind === "text" && techniques.length === 0)} onClick={optimize}>
                      {optimizing ? <Spinner /> : null} {optimizing ? "Rewriting" : opt ? "Rewrite again" : beginner ? "Improve my prompt" : "Rewrite prompt"}
                    </button>
                  </div>

                  {optimizing && !opt && <div className="shimmer" style={{ marginTop: 24, height: 120, borderRadius: 12, background: "var(--surface-2)" }} />}

                  {opt && (
                    <div style={{ marginTop: 28 }}>
                      <div className="delta">
                        <span className="label">Prompt score</span>
                        <span className="num" style={{ color: scoreColor(opt.before) }}>{opt.before}</span>
                        <span className="arrow"><Icon.arrow /></span>
                        <span className="num" style={{ color: scoreColor(optLive?.score ?? opt.after) }}><CountUp value={optLive?.score ?? opt.after} /></span>
                        <span className="gain" style={{ color: "var(--good)" }}>+{(optLive?.score ?? opt.after) - opt.before}</span>
                        <span className="tag right">{opt.mode === "llm" ? "AI rewrite" : "Template rewrite"}</span>
                      </div>
                      <div className="split">
                        <div className="pane">
                          <div className="pane-head">Original <span className="tag">{opt.before}</span></div>
                          <div className="pane-body">{prompt}</div>
                        </div>
                        <div className="pane">
                          <div className="pane-head">
                            Optimized, editable <span className="tag accent">{optLive?.score ?? opt.after}</span>
                          </div>
                          <textarea className="editor" aria-label="Optimized prompt" value={optText} onChange={(e) => setOptText(e.target.value)} />
                        </div>
                      </div>
                      {opt.rationale && <p className="rationale">{opt.rationale}</p>}
                      {opt.changes.length > 0 && (
                        <ul className="changes">
                          {opt.changes.map((c, i) => {
                            const lesson = lessonFor(c.technique);
                            return (
                              <li key={i} style={{ "--i": i } as React.CSSProperties}>
                                <b>{c.technique}</b>
                                <span>
                                  {c.description}
                                  {learner && lesson && <LessonBox lesson={lesson} />}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {developer && <CodePanel kind={kind} prompt={optText} shape={shape} seed={seed || 42} model={status?.model} />}
                      <div className="actions">
                        <button className="btn" onClick={() => copyText(optText)}>
                          {copied ? <Icon.check /> : <Icon.copy />} {copied ? "Copied" : "Copy prompt"}
                        </button>
                        <button className="btn" onClick={iterate}><Icon.loop /> Use as new prompt</button>
                        <button className="btn primary push" onClick={() => goView(3)}>Next: compare <Icon.arrow /></button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ---------- 4. Compare ---------- */}
              {view === 3 && opt && (
                <div className="panel" id="evaluate">
                  <div className="panel-head">
                    <h3>{kind === "image" ? "See both images" : "Compare the answers"}</h3>
                    <span className="hint">
                      {kind === "image" ? "Images by Pollinations.ai (FLUX Schnell)" : confirmedIntent ? "Judged against your stated needs" : "Judged against your original request"}
                    </span>
                  </div>

                  {kind === "image" ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <p style={{ color: "var(--text-2)", fontSize: 14, maxWidth: 540 }}>
                          Both prompts are rendered with the same seed and shape ({sizeFor(shape).label}), so the difference comes from the prompt. Prompts are sent to Pollinations.ai.
                          {!imageKey && !status?.imageKey && <> Without a key you get a few free, watermarked images; <button className="linklike" onClick={() => openKeys("image")}>add a free key</button> for more.</>}
                        </p>
                        <button className="btn primary" disabled={imgBusy !== null} onClick={renderImages}>
                          {imgBusy ? <Spinner /> : <Icon.play />} {imgBusy ? `Rendering ${imgBusy === "a" ? "1" : "2"} of 2` : seed ? "New variation" : "Generate both images"}
                        </button>
                      </div>
                      {seed > 0 && (
                        <div className="img-grid" style={{ "--ar": `${sizeFor(shape).width} / ${sizeFor(shape).height}` } as React.CSSProperties}>
                          {([["a", "Original prompt", prompt], ["b", "Optimized prompt", optText]] as const).map(([k, title, p]) => (
                            <figure key={k} className="img-card">
                              <div className={`img-frame ${images[k] ? "ready" : imgBusy === k ? "shimmer" : ""}`}>
                                {images[k] ? <img src={images[k]} alt={`Image generated from the ${title.toLowerCase()}`} /> : <span className="img-wait">{imgBusy === k ? "Rendering…" : "Waiting"}</span>}
                              </div>
                              <figcaption>
                                <b>{title}</b>
                                <span>{p.length > 120 ? `${p.slice(0, 118)}…` : p}</span>
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      )}
                      {images.b && (
                        <div className="actions end">
                          <button className="btn primary" onClick={() => goView(4)}>See summary <Icon.arrow /></button>
                        </div>
                      )}
                    </>
                  ) : live ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <p style={{ color: "var(--text-2)", fontSize: 14, maxWidth: 520 }}>
                        Runs both prompts on the same model, then one judge compares the two answers against {confirmedIntent ? "the needs you confirmed" : "what you originally asked"}, including how concise they are.
                      </p>
                      <button className="btn primary" disabled={running || !optText.trim()} onClick={runComparison}>
                        {running ? <Spinner /> : <Icon.play />} {running ? "Generating and judging (4 steps)" : runs ? "Run again" : "Run both and compare"}
                      </button>
                    </div>
                  ) : (
                    <div className="notice info" style={{ marginTop: 0 }}>
                      <Icon.key />
                      <span>
                        Generating answers needs an LLM API key. <button className="linklike" onClick={() => openKeys("text")}>Add a free Groq key</button> (2 minutes, guide included), or
                        paste an answer you already have below to get the rule-based checks. You can still see the summary.
                      </span>
                    </div>
                  )}

                  {kind === "text" && running && !runs && (
                    <div className="eval-grid" style={{ marginTop: 24 }}>
                      <div className="shimmer" style={{ height: 220, borderRadius: 12, background: "var(--surface-2)" }} />
                      <div className="shimmer" style={{ height: 220, borderRadius: 12, background: "var(--surface-2)" }} />
                    </div>
                  )}

                  {kind === "text" && runs && <Comparison runs={runs} />}

                  {kind === "text" && (
                    <>
                      <details className="disclose">
                        <summary><Icon.chevron /> Evaluate an answer you already have</summary>
                        <div>
                          <div className="editor-wrap">
                            <textarea
                              className="editor"
                              style={{ minHeight: 120 }}
                              placeholder="Paste a model's answer to check it against the optimized prompt"
                              value={manualResponse}
                              onChange={(e) => setManualResponse(e.target.value)}
                            />
                          </div>
                          <button className="btn" style={{ marginTop: 12 }} disabled={!manualResponse.trim()} onClick={evaluateManual}>Evaluate answer</button>
                          {manualEval && <div style={{ marginTop: 16 }}><EvalCard title="Your answer" result={manualEval} /></div>}
                        </div>
                      </details>
                      <div className="actions end">
                        <button className={`btn ${runs ? "primary" : ""}`} onClick={() => goView(4)}>See summary <Icon.arrow /></button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ---------- 5. Summary ---------- */}
              {view === 4 && opt && analysis && (
                <div className="panel summary" id="summary">
                  <div className="panel-head">
                    <h3>Your summary</h3>
                    <span className="hint">Download it as a report with analytics and a technique guide</span>
                  </div>
                  <div className="kpis">
                    <Kpi label="Prompt score" value={`${opt.before} → ${optLive?.score ?? opt.after}`} note={`+${(optLive?.score ?? opt.after) - opt.before} after rewrite`} tone="good" />
                    {runs ? (
                      <Kpi label="Answer score" value={`${runs.original.evaluation.judge?.overall} → ${runs.optimized.evaluation.judge?.overall}`} note={runs.winner === "optimized" ? "Judge preferred yours" : runs.winner === "tie" ? "No clear difference" : "Original preferred"} tone={runs.winner === "optimized" ? "good" : "warn"} />
                    ) : kind === "image" && images.b ? (
                      <Kpi label="Images" value="2 rendered" note={`Same seed ${seed}`} />
                    ) : (
                      <Kpi label="Answers" value="Not compared" note={kind === "image" ? "Generate both images" : live ? "Run the comparison" : "Needs an API key"} />
                    )}
                    {runs?.original.tokens && runs.optimized.tokens ? (
                      <Kpi label="Output tokens" value={`${runs.original.tokens.completion} → ${runs.optimized.tokens.completion}`} note={`${Math.round((1 - runs.optimized.tokens.completion / runs.original.tokens.completion) * 100)}% change`} />
                    ) : (
                      <Kpi label="Prompt size" value={`~${estimateTokens(optText)} tokens`} note={`${optText.split(/\s+/).filter(Boolean).length} words`} />
                    )}
                    <Kpi label="Needs stated" value={String(confirmedIntent ? fields.filter((f) => confirmedIntent[f.key]?.trim()).length : 0)} note={confirmedIntent ? "Used as the target" : "Left open"} />
                  </div>

                  <div className="split" style={{ marginTop: 20 }}>
                    <div className="pane">
                      <div className="pane-head">Before <span className="tag">{opt.before}</span></div>
                      <div className="pane-body">{prompt}</div>
                    </div>
                    <div className="pane">
                      <div className="pane-head">
                        After <span className="tag accent">{optLive?.score ?? opt.after}</span>
                      </div>
                      <div className="pane-body">{optText}</div>
                    </div>
                  </div>

                  {kind === "image" && images.a && images.b && (
                    <div className="img-grid small" style={{ "--ar": `${sizeFor(shape).width} / ${sizeFor(shape).height}` } as React.CSSProperties}>
                      <figure className="img-card"><div className="img-frame ready"><img src={images.a} alt="Original prompt image" /></div><figcaption><b>Before</b></figcaption></figure>
                      <figure className="img-card"><div className="img-frame ready"><img src={images.b} alt="Optimized prompt image" /></div><figcaption><b>After</b></figcaption></figure>
                    </div>
                  )}

                  {confirmedIntent && (
                    <>
                      <div className="subhead">What you asked for</div>
                      <div className="chips">
                        {fields.filter((f) => confirmedIntent[f.key]?.trim()).map((f) => (
                          <span key={f.key} className="tag accent">{f.label}: {confirmedIntent[f.key]}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {opt.changes.length > 0 && (
                    <>
                      <div className="subhead">What changed</div>
                      <ul className="changes">
                        {opt.changes.map((c, i) => (
                          <li key={i}><b>{c.technique}</b><span>{c.description}</span></li>
                        ))}
                      </ul>
                    </>
                  )}

                  {learner && (
                    <>
                      <div className="subhead">What you learned</div>
                      <div className="lesson-grid">
                        {[...new Set([...opt.changes.map((c) => c.technique), ...analysis.issues.map((i) => i.technique)])]
                          .map((t) => lessonFor(t))
                          .filter((l): l is Lesson => Boolean(l))
                          .slice(0, 6)
                          .map((l) => (
                            <div key={l.title} className="lesson-card"><b>{l.title}</b><p>{l.what}</p></div>
                          ))}
                      </div>
                    </>
                  )}

                  {developer && <CodePanel kind={kind} prompt={optText} shape={shape} seed={seed || 42} model={status?.model} />}

                  <div className="actions">
                    <button className="btn primary" onClick={downloadReport}><Icon.arrow /> Download report</button>
                    <button className="btn" onClick={openPrintable}>Open printable (save as PDF)</button>
                    {developer && <button className="btn" onClick={downloadJson}>Export JSON</button>}
                    <button className="btn" onClick={() => copyText(optText)}>{copied ? <Icon.check /> : <Icon.copy />} {copied ? "Copied" : "Copy prompt"}</button>
                    <button className="btn ghost push" onClick={() => { setPrompt(""); setAnalysis(null); resetDownstream(); setIntent(EMPTY_INTENT); setIntentDone(null); goView(0); }}>
                      <Icon.loop /> Start a new prompt
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {warning && <div className="notice warn"><Icon.alert /><span>{warning}</span></div>}
          {error && <div className="notice bad" role="alert"><Icon.alert /><span>{error}</span></div>}
        </main>

        <aside className="side">
          <div className="panel keys-panel">
            <div className="panel-head"><h3>Your keys</h3></div>
            <ul className="key-status">
              <li>
                <span className={`kdot ${status?.serverKey || userKey ? "on" : ""}`} />
                <span>Text AI</span>
                <b>{status?.serverKey ? "Site key active" : userKey ? "Your key" : "Offline only"}</b>
              </li>
              <li>
                <span className={`kdot ${status?.imageKey || imageKey ? "on" : "warn"}`} />
                <span>Images</span>
                <b>{status?.imageKey ? "Site key active" : imageKey ? "Your key" : "Limited without key"}</b>
              </li>
            </ul>
            <button className="btn sm keys-cta" onClick={() => openKeys(status?.serverKey || userKey ? "image" : "text")}>
              <Icon.key /> Add your own keys
            </button>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>{kind === "image" ? "Image samples" : "Samples"}</h3></div>
            <ul className="list">
              {samples.map((s) => (
                <li key={s.title}>
                  <button onClick={() => loadPrompt(s.prompt)}>
                    <span className="t">{s.title}</span>
                    <span className="s">{s.prompt}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>History</h3>
              {history.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setHistory([]); save(HISTORY_STORE, []); }}>Clear</button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="empty">Optimized prompts appear here.</div>
            ) : (
              <ul className="list">
                {history.map((h) => (
                  <li key={h.id}>
                    <button onClick={() => loadPrompt(h.original, h.kind ?? "text")}>
                      <span className="t">
                        <span>{h.kind === "image" ? "Image · " : ""}{h.before} <span className="n">to</span> {h.after}</span>
                        {h.evalOptimized != null && <span className="n">judge {h.evalOriginal ?? "n/a"} / {h.evalOptimized}</span>}
                      </span>
                      <span className="s">{h.original}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <footer>
        <span>PromptForge AI · Generative AI Capstone Project 2026</span>
        <span>{status?.model ? `Model: ${status.model}` : ""}{kind === "image" ? " · Images by Pollinations.ai" : ""}</span>
      </footer>
      </div>

      {showSettings && (
        <div className="modal-back" onClick={() => setShowSettings(false)}>
          <div className="modal keys-modal" role="dialog" aria-modal="true" aria-labelledby="keys-title" onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") setShowSettings(false); }}>
            <h2 id="keys-title">Add your own keys</h2>
            <p>Both are free to start. Keys you paste here stay in this browser and are only sent to PromptForge&apos;s own server to make the request.</p>
            <div className="kind keys-tabs" role="tablist">
              <button role="tab" aria-selected={keysTab === "text"} className={keysTab === "text" ? "on" : ""} onClick={() => setKeysTab("text")}>Text AI (Groq)</button>
              <button role="tab" aria-selected={keysTab === "image"} className={keysTab === "image" ? "on" : ""} onClick={() => setKeysTab("image")}>Images (Pollinations)</button>
            </div>

            {keysTab === "text" ? (
              <div className="keys-guide">
                <p className="keys-what">Unlocks the AI critique, AI rewrites, answer generation and the judge. {status?.serverKey ? <b>This site already has a key, so you only need your own if the shared one hits its limit.</b> : null}</p>
                <ol className="guide-steps">
                  <li><span><b>Open the Groq console</b> and sign in with Google, GitHub or email.</span><a className="btn sm primary" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Get a Groq key <Icon.arrow /></a></li>
                  <li><span><b>Click &ldquo;Create API Key&rdquo;</b>, give it a name like &ldquo;PromptForge&rdquo;.</span></li>
                  <li><span><b>Copy the key</b> (it starts with <code>gsk_</code>). Groq shows it only once.</span></li>
                  <li><span><b>Paste it below</b> and press Save.</span></li>
                </ol>
                <label htmlFor="key">Your Groq key</label>
                <input id="key" autoFocus className="field" type="password" placeholder="gsk_..." value={userKey} onChange={(e) => setUserKey(e.target.value)} />
                <p className="keys-note">Free tier: about 8,000 tokens per minute and 200,000 per day on the default model, roughly one comparison a minute. No card needed.</p>
              </div>
            ) : (
              <div className="keys-guide">
                <p className="keys-what">Renders image prompts. Without a key only a couple of watermarked images work. {status?.imageKey ? <b>This site already has an image key.</b> : null}</p>
                <ol className="guide-steps">
                  <li><span><b>Sign in at Pollinations.</b></span><a className="btn sm primary" href="https://enter.pollinations.ai" target="_blank" rel="noreferrer">Open Pollinations <Icon.arrow /></a></li>
                  <li><span><b>Get free Pollen:</b> open <b>Quests</b>, complete the ones you are eligible for and claim the rewards. No card needed.</span></li>
                  <li><span><b>Create a Personal Secret Key</b> (starts with <code>sk_</code>), not an App Key. Give it a small <b>Pollen budget</b> so it can never overspend.</span><a className="btn sm" href="https://enter.pollinations.ai/keys" target="_blank" rel="noreferrer">Create a key <Icon.arrow /></a></li>
                  <li><span><b>Paste it below</b> and press Save.</span></li>
                </ol>
                <label htmlFor="image-key">Your Pollinations key</label>
                <input id="image-key" autoFocus className="field" type="password" placeholder="sk_..." value={imageKey} onChange={(e) => setImageKey(e.target.value)} />
                <p className="keys-note">Cost: about 0.002 Pollen per image with the default FLUX Schnell model, so a budget of 1 Pollen covers roughly 500 images.</p>
              </div>
            )}

            <details className="disclose keys-owner">
              <summary><Icon.chevron /> Running your own copy? Set keys for every visitor</summary>
              <div>
                <p>On Vercel open your project, then <b>Settings → Environment Variables</b>, add the keys below and redeploy. Never put keys in code or commit them to GitHub.</p>
                <pre className="code">{`LLM_API_KEY=gsk_...          # Groq, text AI
POLLINATIONS_API_KEY=sk_...  # Pollinations, images`}</pre>
              </div>
            </details>

            <div className="modal-actions">
              <button className="btn ghost" onClick={() => { setUserKey(""); setImageKey(""); save(KEY_STORE, ""); save(IMAGE_KEY_STORE, ""); }}>Remove my keys</button>
              <button className="btn primary" onClick={() => { save(KEY_STORE, userKey.trim()); save(IMAGE_KEY_STORE, imageKey.trim()); setShowSettings(false); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TechniqueChips({ techniques, toggle, learner }: { techniques: TechniqueId[]; toggle: (id: TechniqueId) => void; learner?: boolean }) {
  return (
    <div className="chips" role="group" aria-label="Techniques">
      {TECHNIQUES.map((t) => {
        const on = techniques.includes(t.id);
        return (
          <button key={t.id} className={`chip ${on ? "on" : ""}`} aria-pressed={on} title={learner ? lessonFor(t.label === "Output format" ? "Output formatting" : t.label)?.why ?? t.description : t.description} onClick={() => toggle(t.id)}>
            <span className="tick"><Icon.check size={10} /></span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function LessonBox({ lesson }: { lesson: Lesson }) {
  return (
    <details className="lesson-box">
      <summary>Learn: {lesson.title}</summary>
      <div>
        <p>{lesson.what}</p>
        <p className="why">Why it works: {lesson.why}</p>
        <div className="ba">
          <div><span>Before</span><code>{lesson.before}</code></div>
          <div><span>After</span><code>{lesson.after}</code></div>
        </div>
      </div>
    </details>
  );
}

function CodePanel({ kind, prompt, shape, seed, model }: { kind: Kind; prompt: string; shape?: string; seed: number; model?: string }) {
  const [lang, setLang] = useState<SnippetLang>("javascript");
  const [done, setDone] = useState(false);
  const code = kind === "image" ? imageSnippet(lang, prompt, shape, seed) : textSnippet(lang, prompt, model || undefined);
  return (
    <div className="code-panel">
      <div className="code-head">
        <div className="tabs" role="tablist">
          {(["javascript", "python", "curl"] as const).map((l) => (
            <button key={l} role="tab" aria-selected={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l === "javascript" ? "JavaScript" : l === "python" ? "Python" : "curl"}</button>
          ))}
        </div>
        <span className="code-meta">~{estimateTokens(prompt)} prompt tokens{kind === "image" ? " · needs a free Pollinations key" : ""}</span>
        <button className="btn sm" onClick={() => { navigator.clipboard.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}>
          {done ? <Icon.check /> : <Icon.copy />} {done ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre className="code">{code}</pre>
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "warn" }) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <span className="label">{label}</span>
      <b>{value}</b>
      <span className="note">{note}</span>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="analysis shimmer" style={{ marginTop: 32 }}>
      <div style={{ width: 148, height: 148, borderRadius: "50%", background: "var(--surface-3)", margin: "0 auto" }} />
      <div className="bars">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 6}%` }} />)}
      </div>
    </div>
  );
}

function Comparison({ runs }: { runs: Runs }) {
  const a = runs.original.evaluation.judge!.overall;
  const b = runs.optimized.evaluation.judge!.overall;
  const { winner } = runs;
  const ta = runs.original.tokens?.completion;
  const tb = runs.optimized.tokens?.completion;
  const saving = ta && tb ? 1 - tb / ta : null; // share of output tokens saved by the optimized prompt
  const speed = runs.optimized.latencyMs > 0 ? runs.original.latencyMs / runs.optimized.latencyMs : null;
  const similar = Math.abs(b - a) <= 3;
  const cheaper = saving != null && saving >= 0.3;
  const headline =
    winner === "optimized"
      ? "The optimized answer scored higher."
      : winner === "original"
        ? similar && cheaper
          ? `Near-identical quality, and the optimized answer used ${Math.round(saving! * 100)}% fewer tokens.`
          : "The original answer scored higher. Try different techniques and run again."
        : cheaper
          ? `No clear quality difference, and the optimized answer used ${Math.round(saving! * 100)}% fewer tokens.`
          : runs.consistent
            ? "Both answers scored about the same."
            : "Too close to call: the two judging orders disagreed.";
  return (
    <>
      <div className="verdict">
        <span className="num" style={{ font: "700 28px var(--sans)", color: scoreColor(a) }}><CountUp value={a} /></span>
        <span style={{ color: "var(--muted)" }}><Icon.arrow /></span>
        <span className="num" style={{ font: "700 28px var(--sans)", color: scoreColor(b) }}><CountUp value={b} /></span>
        <div className="verdict-text">
          <span className="msg">{headline}</span>
          {runs.reason && <span className="why">{runs.reason}</span>}
        </div>
      </div>
      {saving != null && speed != null && (
        <div className="efficiency">
          <Metric label="Output tokens" a={ta!} b={tb!} better={tb! <= ta!} note={`${Math.abs(Math.round(saving * 100))}% ${saving >= 0 ? "fewer" : "more"}`} />
          <Metric label="Latency" a={`${(runs.original.latencyMs / 1000).toFixed(1)}s`} b={`${(runs.optimized.latencyMs / 1000).toFixed(1)}s`} better={speed >= 1} note={speed >= 1 ? `${speed.toFixed(1)}x faster` : `${(1 / speed).toFixed(1)}x slower`} />
          <Metric label="Words" a={runs.original.evaluation.metrics.wordCount} b={runs.optimized.evaluation.metrics.wordCount} better={runs.optimized.evaluation.metrics.wordCount <= runs.original.evaluation.metrics.wordCount} />
        </div>
      )}
      <div className="eval-grid">
        <EvalCard title="Original prompt" run={runs.original} result={runs.original.evaluation} winner={winner === "original"} rulesLabel={runs.intentUsed ? "Your stated needs" : "Your original request"} />
        <EvalCard title="Optimized prompt" run={runs.optimized} result={runs.optimized.evaluation} winner={winner === "optimized"} rulesLabel={runs.intentUsed ? "Your stated needs" : "Your original request"} />
      </div>
    </>
  );
}

function Metric({ label, a, b, better, note }: { label: string; a: number | string; b: number | string; better: boolean; note?: string }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="vals"><b>{a}</b> <Icon.arrow /> <b>{b}</b></span>
      {note && <span className={`tag ${better ? "good" : "warn"}`}>{note}</span>}
    </div>
  );
}

function EvalCard({ title, run, result, winner, rulesLabel = "Rules in the prompt" }: { title: string; run?: RunResult; result: EvalResult; winner?: boolean; rulesLabel?: string }) {
  const { metrics, judge } = result;
  return (
    <div className="eval-card">
      <div className="top">
        <h4>{title} {winner && <span className="tag good">Preferred</span>}</h4>
        {judge && <span className="big" style={{ color: scoreColor(judge.overall) }}><CountUp value={judge.overall} /></span>}
      </div>
      {judge && (
        <div className="bars">
          {Object.entries(judge.scores).map(([k, v], i) => <Bar key={k} index={i} label={CRITERIA_LABELS[k] ?? k} value={v} />)}
        </div>
      )}
      {judge?.feedback && <p className="feedback">{judge.feedback}</p>}
      <div className="checks-label">{rulesLabel}</div>
      <ul className="checks">
        {metrics.checks.map((c) => (
          <li key={c.label}>
            <span><span className={c.passed ? "ok" : "no"}>{c.passed ? "Pass" : "Fail"}</span> · {c.label}</span>
            <span className="detail">{c.detail}</span>
          </li>
        ))}
      </ul>
      <div className="stats">
        <span><b>{metrics.wordCount}</b> words</span>
        <span>Readability <b>{metrics.readability}</b></span>
        {run && <span><b>{(run.latencyMs / 1000).toFixed(1)}s</b> latency</span>}
        {run?.tokens && <span><b>{run.tokens.completion}</b> tokens</span>}
      </div>
      {result.warning && <div className="notice warn"><Icon.alert /><span>{result.warning}</span></div>}
      {run && (
        <details className="disclose">
          <summary><Icon.chevron /> Show answer</summary>
          <div className="pane"><div className="pane-body prose">{run.response}</div></div>
        </details>
      )}
    </div>
  );
}

function lowerFirst(text: string) {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
