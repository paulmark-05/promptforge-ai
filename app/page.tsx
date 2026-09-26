"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzePrompt, type Analysis } from "../lib/analyzer";
import { TECHNIQUES, type TechniqueId, type Change } from "../lib/optimizer";
import type { ResponseMetrics } from "../lib/metrics";
import { SAMPLE_PROMPTS } from "../lib/templates";
import { Bar, CountUp, Icon, Logo, ScoreRing, SeverityTag, Spinner, scoreColor, scoreTone } from "../components/ui";
import { HeroCircuit } from "../components/HeroCircuit";
import { combineVerdicts, type PairwiseResult } from "../lib/judge";

interface Critique { summary?: string; strengths?: string[]; weaknesses?: string[]; suggestions?: string[] }
interface OptResult { optimizedPrompt: string; changes: Change[]; rationale: string; mode: "llm" | "offline"; before: number; after: number; warning?: string }
interface Judge { scores: Record<string, number>; overall: number; feedback: string; improvements: string[] }
interface EvalResult { metrics: ResponseMetrics; judge: Judge | null; warning?: string }
interface RunResult { response: string; latencyMs: number; tokens?: { prompt: number; completion: number }; evaluation: EvalResult }
type Pass = PairwiseResult & { metrics: { original: ResponseMetrics; optimized: ResponseMetrics } };
interface Runs { original: RunResult; optimized: RunResult; winner: PairwiseResult["winner"]; reason: string; consistent: boolean }
interface HistoryItem { id: string; at: number; original: string; optimized: string; before: number; after: number; evalOriginal?: number; evalOptimized?: number }

const KEY_STORE = "pf_user_key";
const HISTORY_STORE = "pf_history";
const DEFAULT_TECHNIQUES: TechniqueId[] = ["role", "context", "cot", "format", "constraints", "delimiters"];
const CRITERIA_LABELS: Record<string, string> = {
  relevance: "Relevance",
  completeness: "Completeness",
  accuracy: "Accuracy",
  clarity: "Clarity",
  conciseness: "Conciseness",
  instruction_following: "Instruction following",
};

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

export default function Home() {
  const [status, setStatus] = useState<{ serverKey: boolean; model: string } | null>(null);
  const [userKey, setUserKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [prompt, setPrompt] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [critique, setCritique] = useState<Critique | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [techniques, setTechniques] = useState<TechniqueId[]>(DEFAULT_TECHNIQUES);
  const [opt, setOpt] = useState<OptResult | null>(null);
  const [optText, setOptText] = useState("");
  const [optimizing, setOptimizing] = useState(false);

  const [runs, setRuns] = useState<Runs | null>(null);
  const [running, setRunning] = useState(false);
  const [manualResponse, setManualResponse] = useState("");
  const [manualEval, setManualEval] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Presentation-only state
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const step1 = useRef<HTMLElement>(null);
  const step2 = useRef<HTMLElement>(null);
  const step3 = useRef<HTMLElement>(null);
  const optResultRef = useRef<HTMLDivElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserKey(load(KEY_STORE, ""));
    setHistory(load(HISTORY_STORE, []));
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ serverKey: false, model: "" }));
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Bring newly produced results into view so the user never has to hunt for them.
  useEffect(() => {
    if (opt) optResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [opt]);
  useEffect(() => {
    if (runs) compareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [runs]);

  const live = Boolean(status?.serverKey || userKey);
  const optLive = useMemo(() => (optText.trim() ? analyzePrompt(optText) : null), [optText]);
  const stage = runs ? 3 : opt ? 2 : analysis ? 1 : 0; // completed steps
  const canOptimize = Boolean(analysis && !analysis.injectionRisk);

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

  function resetDownstream() {
    setOpt(null);
    setOptText("");
    setRuns(null);
    setManualEval(null);
    setWarning(null);
    setError(null);
  }

  async function analyze(text = prompt) {
    if (!text.trim()) return;
    setAnalyzing(true);
    resetDownstream();
    setCritique(null);
    try {
      const r = await api<{ analysis: Analysis; critique: Critique | null; warning?: string }>("/api/analyze", { prompt: text });
      setAnalysis(r.analysis);
      setCritique(r.critique);
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
    setError(null);
    try {
      const r = await api<OptResult>("/api/optimize", { prompt, techniques });
      setOpt(r);
      setOptText(r.optimizedPrompt);
      if (r.warning) setWarning(r.warning);
      pushHistory({ original: prompt, optimized: r.optimizedPrompt, before: r.before, after: r.after });
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
      // Head-to-head judging against the ORIGINAL request, once in each order to cancel position bias.
      const body = { originalPrompt: prompt, optimizedPrompt: optText, originalAnswer: a.text, optimizedAnswer: b.text };
      const p1 = await api<Pass>("/api/compare", { ...body, swap: false });
      const p2 = await api<Pass>("/api/compare", { ...body, swap: true });
      const v = { ...combineVerdicts(p1, p2), metrics: p1.metrics };
      const original: RunResult = { response: a.text, latencyMs: a.latencyMs, tokens: a.tokens, evaluation: { metrics: v.metrics.original, judge: { ...v.original, improvements: [] } } };
      const optimized: RunResult = { response: b.text, latencyMs: b.latencyMs, tokens: b.tokens, evaluation: { metrics: v.metrics.optimized, judge: { ...v.optimized, improvements: [] } } };
      setRuns({ original, optimized, winner: v.winner, reason: v.reason, consistent: v.consistent });
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

  function loadPrompt(p: string) {
    setPrompt(p);
    setAnalysis(null);
    setCritique(null);
    resetDownstream();
    analyze(p);
    step1.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function iterate() {
    setPrompt(optText);
    analyze(optText);
    step1.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startWriting() {
    step1.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => editorRef.current?.focus({ preventScroll: true }), 350);
  }

  async function copyOptimized() {
    try {
      await navigator.clipboard.writeText(optText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  const toggle = (id: TechniqueId) =>
    setTechniques((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const go = (ref: React.RefObject<HTMLElement | null>) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const marker = (n: number) => (stage >= n ? "done" : stage === n - 1 ? "current" : "");

  return (
    <>
      <div className="backdrop" />

      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-left">
          <a className="logo" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <Logo /> PromptForge
          </a>
          <nav className="nav-links" aria-label="Workflow">
            <button className="nav-link" onClick={() => go(step1)}>Analyze</button>
            <button className="nav-link" disabled={!canOptimize} onClick={() => go(step2)}>Optimize</button>
            <button className="nav-link" disabled={!opt} onClick={() => go(step3)}>Evaluate</button>
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
            <Icon.key /> API key
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <h1>Better prompts, measured.</h1>
        <p className="lede">
          Score a prompt on 8 prompt-engineering dimensions, rewrite it with the techniques you choose, then run both
          versions and compare the answers side by side.
        </p>
        <div className="hero-actions">
          <button className="btn primary lg" onClick={startWriting}>
            Analyze a prompt <Icon.arrow />
          </button>
          <button className="btn lg" onClick={() => loadPrompt(SAMPLE_PROMPTS[0].prompt)}>
            Try a sample
          </button>
        </div>
        <HeroCircuit analysis={analysis} />
      </section>

      <div className="workspace">
        <main>
          <div className="flow">
            <div className="rail">
              <div className="rail-fill" style={{ height: `${(Math.min(stage, 2) / 2) * 100}%` }} />
            </div>

            {/* Step 1: Analyze */}
            <section className="step" ref={step1} id="analyze">
              <span className={`step-marker ${marker(1)}`}>{stage >= 1 ? <Icon.check /> : "01"}</span>
              <div className="panel">
                <div className="panel-head">
                  <h3>Write your prompt</h3>
                  <span className="hint">Scored instantly, no API key needed</span>
                </div>
                <div className="editor-wrap">
                  <textarea
                    ref={editorRef}
                    className="editor"
                    value={prompt}
                    maxLength={6000}
                    placeholder="e.g. explain machine learning"
                    aria-label="Prompt"
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
                    }}
                  />
                  <div className="editor-bar">
                    <span className="kbd"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to analyze</span>
                    <div className="row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="counter">{prompt.length.toLocaleString()} / 6,000</span>
                      <button className="btn primary" disabled={!prompt.trim() || analyzing} onClick={() => analyze()}>
                        {analyzing ? <Spinner /> : null} {analyzing ? "Analyzing" : "Analyze"}
                      </button>
                    </div>
                  </div>
                </div>

                {analyzing && !analysis && <AnalysisSkeleton />}

                {analysis && (
                  <div key={analysis.score + analysis.wordCount} style={{ marginTop: 32 }}>
                    <div className="analysis">
                      <div className="score-box">
                        <ScoreRing score={analysis.score} />
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
                        <div className="subhead">Issues found <span className="tag">{analysis.issues.length}</span></div>
                        <ul className="issues">
                          {analysis.issues.map((i, idx) => (
                            <li className="issue" key={i.id} style={{ "--i": idx } as React.CSSProperties}>
                              <SeverityTag severity={i.severity} />
                              <div>
                                <div className="tech">{i.technique}</div>
                                <div className="msg">{i.message}</div>
                                <div className="fix">{i.suggestion}</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {critique && (
                      <div className="critique">
                        <div className="subhead" style={{ margin: "0 0 8px" }}>AI critique</div>
                        {critique.summary && <p>{critique.summary}</p>}
                        {!!critique.weaknesses?.length && (<><div className="label">Weaknesses</div><ul>{critique.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul></>)}
                        {!!critique.suggestions?.length && (<><div className="label">Suggestions</div><ul>{critique.suggestions.map((w, i) => <li key={i}>{w}</li>)}</ul></>)}
                      </div>
                    )}

                    {canOptimize && !opt && (
                      <div className="actions">
                        <button className="btn" onClick={() => go(step2)}>Next: optimize <Icon.arrow /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Step 2: Optimize */}
            {canOptimize && (
              <section className="step" ref={step2} id="optimize">
                <span className={`step-marker ${marker(2)}`}>{stage >= 2 ? <Icon.check /> : "02"}</span>
                <div className="panel">
                  <div className="panel-head">
                    <h3>Choose techniques</h3>
                    <span className="hint">{live ? "Rewritten by the LLM" : "Rewritten with offline templates"}</span>
                  </div>
                  <div className="chips" role="group" aria-label="Techniques">
                    {TECHNIQUES.map((t) => {
                      const on = techniques.includes(t.id);
                      return (
                        <button key={t.id} className={`chip ${on ? "on" : ""}`} aria-pressed={on} title={t.description} onClick={() => toggle(t.id)}>
                          <span className="tick"><Icon.check size={10} /></span>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="hint" style={{ fontSize: 13, color: "var(--muted)" }}>{techniques.length} of {TECHNIQUES.length} selected</span>
                    <button className="btn primary" disabled={optimizing || techniques.length === 0} onClick={optimize}>
                      {optimizing ? <Spinner /> : null} {optimizing ? "Optimizing" : "Optimize prompt"}
                    </button>
                  </div>

                  {optimizing && !opt && <div className="shimmer" style={{ marginTop: 24, height: 120, borderRadius: 12, background: "var(--surface-2)" }} />}

                  {opt && (
                    <div ref={optResultRef} style={{ marginTop: 32, scrollMarginTop: 96 }}>
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
                          {opt.changes.map((c, i) => (
                            <li key={i} style={{ "--i": i } as React.CSSProperties}><b>{c.technique}</b><span>{c.description}</span></li>
                          ))}
                        </ul>
                      )}
                      <div className="actions">
                        <button className="btn" onClick={copyOptimized}>
                          {copied ? <Icon.check /> : <Icon.copy />} {copied ? "Copied" : "Copy prompt"}
                        </button>
                        <button className="btn" onClick={iterate}><Icon.loop /> Use as new prompt</button>
                        <button className="btn ghost" onClick={() => go(step3)}>Next: evaluate <Icon.arrow /></button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Step 3: Evaluate */}
            {opt && (
              <section className="step" ref={step3} id="evaluate">
                <span className={`step-marker ${marker(3)}`}>{stage >= 3 ? <Icon.check /> : "03"}</span>
                <div className="panel">
                  <div className="panel-head">
                    <h3>Compare the answers</h3>
                    <span className="hint">Head-to-head LLM judge against your original request</span>
                  </div>
                  {live ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <p style={{ color: "var(--text-2)", fontSize: 14, maxWidth: 520 }}>
                        Runs both prompts on the same model, then one judge compares the two answers against what you originally asked, including how concise they are.
                      </p>
                      <button className="btn primary" disabled={running || !optText.trim()} onClick={runComparison}>
                        {running ? <Spinner /> : <Icon.play />} {running ? "Generating and judging (4 steps)" : "Run both and compare"}
                      </button>
                    </div>
                  ) : (
                    <div className="notice info" style={{ marginTop: 0 }}>
                      <Icon.key />
                      <span>
                        Generating answers needs an LLM API key. Add a free Groq key with the <b>API key</b> button, or
                        paste an answer you already have below to get the rule-based checks.
                      </span>
                    </div>
                  )}

                  {running && !runs && (
                    <div className="eval-grid" style={{ marginTop: 24 }}>
                      <div className="shimmer" style={{ height: 220, borderRadius: 12, background: "var(--surface-2)" }} />
                      <div className="shimmer" style={{ height: 220, borderRadius: 12, background: "var(--surface-2)" }} />
                    </div>
                  )}

                  {runs && (
                    <div ref={compareRef} style={{ scrollMarginTop: 96 }}>
                      <Comparison runs={runs} />
                    </div>
                  )}

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
                </div>
              </section>
            )}

            {warning && <div className="notice warn"><Icon.alert /><span>{warning}</span></div>}
            {error && <div className="notice bad" role="alert"><Icon.alert /><span>{error}</span></div>}
          </div>
        </main>

        <aside className="side">
          <div className="panel">
            <div className="panel-head"><h3>Samples</h3></div>
            <ul className="list">
              {SAMPLE_PROMPTS.map((s) => (
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
                    <button onClick={() => { setPrompt(h.original); analyze(h.original); go(step1); }}>
                      <span className="t">
                        <span>{h.before} <span className="n">to</span> {h.after}</span>
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
        <span>{status?.model ? `Model: ${status.model}` : ""}</span>
      </footer>

      {showSettings && (
        <div className="modal-back" onClick={() => setShowSettings(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") setShowSettings(false); }}>
            <h2 id="settings-title">API key</h2>
            <p>
              {status?.serverKey
                ? `This deployment already has a key configured (model: ${status.model}). Add your own only if the shared one hits its rate limit.`
                : "No server key is configured. A free Groq key enables AI critique, AI rewriting, answer generation and LLM-judge scoring."}
            </p>
            <label htmlFor="key">Your Groq API key</label>
            <input id="key" autoFocus className="field" type="password" placeholder="gsk_..." value={userKey} onChange={(e) => setUserKey(e.target.value)} />
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Stored only in this browser. Get one at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => { setUserKey(""); save(KEY_STORE, ""); }}>Remove key</button>
              <button className="btn primary" onClick={() => { save(KEY_STORE, userKey.trim()); setShowSettings(false); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
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
        <EvalCard title="Original prompt" run={runs.original} result={runs.original.evaluation} winner={winner === "original"} />
        <EvalCard title="Optimized prompt" run={runs.optimized} result={runs.optimized.evaluation} winner={winner === "optimized"} />
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

function EvalCard({ title, run, result, winner }: { title: string; run?: RunResult; result: EvalResult; winner?: boolean }) {
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
      <div className="checks-label">Rules in its own prompt</div>
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
