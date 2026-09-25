"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzePrompt, type Analysis } from "../lib/analyzer";
import { TECHNIQUES, type TechniqueId, type Change } from "../lib/optimizer";
import type { ResponseMetrics } from "../lib/metrics";
import { SAMPLE_PROMPTS } from "../lib/templates";
import { Bar, ScoreRing, SeverityBadge, Spinner, scoreColor } from "../components/ui";

interface Critique { summary?: string; strengths?: string[]; weaknesses?: string[]; suggestions?: string[] }
interface OptResult { optimizedPrompt: string; changes: Change[]; rationale: string; mode: "llm" | "offline"; before: number; after: number; warning?: string }
interface Judge { scores: Record<string, number>; overall: number; feedback: string; improvements: string[] }
interface EvalResult { metrics: ResponseMetrics; judge: Judge | null; warning?: string }
interface RunResult { response: string; latencyMs: number; tokens?: { prompt: number; completion: number }; evaluation: EvalResult }
interface HistoryItem { id: string; at: number; original: string; optimized: string; before: number; after: number; evalOriginal?: number; evalOptimized?: number }

const KEY_STORE = "pf_user_key";
const HISTORY_STORE = "pf_history";
const DEFAULT_TECHNIQUES: TechniqueId[] = ["role", "context", "cot", "format", "constraints", "delimiters"];
const CRITERIA_LABELS: Record<string, string> = {
  relevance: "Relevance",
  completeness: "Completeness",
  accuracy: "Accuracy",
  clarity: "Clarity",
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

  const [runs, setRuns] = useState<{ original: RunResult; optimized: RunResult } | null>(null);
  const [running, setRunning] = useState(false);
  const [manualResponse, setManualResponse] = useState("");
  const [manualEval, setManualEval] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setUserKey(load(KEY_STORE, ""));
    setHistory(load(HISTORY_STORE, []));
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ serverKey: false, model: "" }));
  }, []);

  const live = Boolean(status?.serverKey || userKey);
  const optLive = useMemo(() => (optText.trim() ? analyzePrompt(optText) : null), [optText]);

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

  async function runOne(p: string): Promise<RunResult> {
    const gen = await api<{ text: string; latencyMs: number; tokens?: RunResult["tokens"] }>("/api/generate", { prompt: p });
    const evaluation = await api<EvalResult>("/api/evaluate", { prompt: p, response: gen.text });
    return { response: gen.text, latencyMs: gen.latencyMs, tokens: gen.tokens, evaluation };
  }

  async function runComparison() {
    setRunning(true);
    setError(null);
    try {
      const [original, optimized] = await Promise.all([runOne(prompt), runOne(optText)]);
      setRuns({ original, optimized });
      setHistory((h) => {
        const next = h.map((item, i) =>
          i === 0 && item.optimized === optText
            ? { ...item, evalOriginal: original.evaluation.judge?.overall, evalOptimized: optimized.evaluation.judge?.overall }
            : item,
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
  }

  function iterate() {
    setPrompt(optText);
    analyze(optText);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const toggle = (id: TechniqueId) =>
    setTechniques((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⚒</span>
          PromptForge AI <small>Prompt analyzer · optimizer · evaluator</small>
        </div>
        <div className="topbar-actions">
          {status && (
            <span className={`badge ${live ? "good" : "neutral"}`} title={live ? `Model: ${status.model}` : "Rule-based analysis and template optimizer only"}>
              <span className="dot" /> {live ? "Live AI" : "Offline mode"}
            </span>
          )}
          <button className="btn sm" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </header>

      <div className="layout">
        <main>
          <section className="hero">
            <h1>Forge better prompts, measure better answers.</h1>
            <p>
              Paste a prompt to score it on 8 prompt-engineering dimensions, rewrite it with proven techniques, then run
              both versions and let an LLM judge compare the responses.
            </p>
          </section>

          {/* Step 1: Analyze */}
          <section className="card">
            <div className="card-head">
              <div className="step-title"><span className="step-num">1</span> Write & analyze your prompt</div>
              <span className="muted small">{prompt.length} / 6000</span>
            </div>
            <textarea
              className="editor"
              value={prompt}
              maxLength={6000}
              placeholder="e.g. explain machine learning"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
              }}
            />
            <div className="row between mt">
              <span className="muted small">Ctrl + Enter to analyze</span>
              <button className="btn primary" disabled={!prompt.trim() || analyzing} onClick={() => analyze()}>
                {analyzing ? <Spinner /> : null} Analyze prompt
              </button>
            </div>

            {analysis && (
              <div className="mt" style={{ marginTop: 22 }}>
                <div className="analysis-grid">
                  <div className="score-box">
                    <ScoreRing score={analysis.score} />
                    <div className="meta">
                      Grade <b style={{ color: scoreColor(analysis.score) }}>{analysis.grade}</b> · {analysis.taskType} task
                      <br />
                      {analysis.wordCount} words
                    </div>
                  </div>
                  <div className="bars">
                    {analysis.dimensions.map((d) => (
                      <Bar key={d.key} label={d.label} value={d.score} hint={`${d.note} (weight ${d.weight}%)`} />
                    ))}
                  </div>
                </div>

                {analysis.injectionRisk && (
                  <div className="notice bad">
                    Prompt-injection pattern detected. PromptForge will not optimize or run instructions that try to
                    override system rules.
                  </div>
                )}

                {analysis.issues.length > 0 && (
                  <>
                    <h4 className="mt" style={{ marginBottom: 8 }}>Issues found ({analysis.issues.length})</h4>
                    <ul className="issues">
                      {analysis.issues.map((i) => (
                        <li className="issue" key={i.id}>
                          <SeverityBadge severity={i.severity} />
                          <div>
                            <div className="tech">{i.technique}</div>
                            <div>{i.message}</div>
                            <div className="fix">→ {i.suggestion}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {critique && (
                  <div className="critique">
                    <h4>AI critique</h4>
                    {critique.summary && <p style={{ margin: "0 0 8px" }}>{critique.summary}</p>}
                    {!!critique.weaknesses?.length && (<><b className="small">Weaknesses</b><ul>{critique.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul></>)}
                    {!!critique.suggestions?.length && (<><b className="small">Suggestions</b><ul>{critique.suggestions.map((w, i) => <li key={i}>{w}</li>)}</ul></>)}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Step 2: Optimize */}
          {analysis && !analysis.injectionRisk && (
            <section className="card">
              <div className="card-head">
                <div className="step-title"><span className="step-num">2</span> Optimize with prompt-engineering techniques</div>
                <span className="muted small">{live ? "AI rewrite" : "Offline templates"}</span>
              </div>
              <div className="row">
                {TECHNIQUES.map((t) => (
                  <button key={t.id} className={`chip ${techniques.includes(t.id) ? "on" : ""}`} title={t.description} onClick={() => toggle(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="row between mt">
                <span className="muted small">{techniques.length} technique(s) selected</span>
                <button className="btn primary" disabled={optimizing || techniques.length === 0} onClick={optimize}>
                  {optimizing ? <Spinner /> : null} Optimize prompt
                </button>
              </div>

              {opt && (
                <div style={{ marginTop: 20 }}>
                  <div className="delta">
                    <span>Prompt score</span>
                    <span className="big">{opt.before}</span>→<span className="big">{optLive?.score ?? opt.after}</span>
                    <span>(+{(optLive?.score ?? opt.after) - opt.before})</span>
                    <span className="badge neutral" style={{ marginLeft: "auto" }}>{opt.mode === "llm" ? "AI optimized" : "Template optimized"}</span>
                  </div>
                  <div className="split">
                    <div className="pane">
                      <div className="pane-head">Original <span className="muted">{opt.before}/100</span></div>
                      <div className="pane-body">{prompt}</div>
                    </div>
                    <div className="pane">
                      <div className="pane-head">
                        Optimized (editable) <span className="muted">{optLive?.score ?? opt.after}/100</span>
                      </div>
                      <textarea className="editor" value={optText} onChange={(e) => setOptText(e.target.value)} />
                    </div>
                  </div>
                  {opt.rationale && <p className="muted small" style={{ marginBottom: 0 }}>{opt.rationale}</p>}
                  {opt.changes.length > 0 && (
                    <ul className="changes">
                      {opt.changes.map((c, i) => (
                        <li key={i}><b>{c.technique}</b><span>{c.description}</span></li>
                      ))}
                    </ul>
                  )}
                  <div className="row mt">
                    <button className="btn sm" onClick={() => navigator.clipboard.writeText(optText)}>Copy optimized</button>
                    <button className="btn sm" onClick={iterate}>Use as new prompt & re-analyze</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Step 3: Evaluate */}
          {opt && (
            <section className="card">
              <div className="card-head">
                <div className="step-title"><span className="step-num">3</span> Test & evaluate responses</div>
              </div>
              {live ? (
                <>
                  <p className="muted small" style={{ marginTop: 0 }}>
                    Runs the original and optimized prompts on the same model, then scores each response with an
                    LLM judge (5 criteria) and rule-based compliance checks.
                  </p>
                  <button className="btn primary" disabled={running || !optText.trim()} onClick={runComparison}>
                    {running ? <Spinner /> : null} {running ? "Generating and judging…" : "Run both & compare"}
                  </button>
                </>
              ) : (
                <div className="notice info">
                  Response generation needs an LLM API key. Add a free Groq key in <b>Settings</b>, or paste a response
                  you got elsewhere below to get the rule-based metrics.
                </div>
              )}

              {runs && <Comparison runs={runs} />}

              <details className="mt">
                <summary className="small" style={{ cursor: "pointer" }}>Evaluate a response you already have</summary>
                <textarea
                  className="editor mt"
                  style={{ minHeight: 110 }}
                  placeholder="Paste a model response to evaluate against the optimized prompt"
                  value={manualResponse}
                  onChange={(e) => setManualResponse(e.target.value)}
                />
                <button className="btn sm mt" disabled={!manualResponse.trim()} onClick={evaluateManual}>Evaluate response</button>
                {manualEval && <div className="mt"><EvalCard title="Your response" result={manualEval} /></div>}
              </details>
            </section>
          )}

          {warning && <div className="notice warn">{warning}</div>}
          {error && <div className="notice bad">{error}</div>}
        </main>

        <aside className="side">
          <div className="card">
            <h3>Try a sample</h3>
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
          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>History</h3>
              {history.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setHistory([]); save(HISTORY_STORE, []); }}>Clear</button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="empty">Optimized prompts will appear here.</div>
            ) : (
              <ul className="list">
                {history.map((h) => (
                  <li key={h.id}>
                    <button onClick={() => { setPrompt(h.original); analyze(h.original); }}>
                      <span className="t">
                        {h.before} → {h.after}
                        {h.evalOptimized != null && <span className="muted"> · judge {h.evalOriginal ?? "–"} → {h.evalOptimized}</span>}
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
      <footer>PromptForge AI · Generative AI Capstone Project 2026</footer>

      {showSettings && (
        <div className="modal-back" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <p className="muted small">
              {status?.serverKey
                ? `This deployment already has an AI key configured (model: ${status.model}). You only need your own key if the shared one hits its rate limit.`
                : "No server key is configured. Add a free Groq API key to enable AI critique, AI optimization, response generation and LLM-as-judge evaluation."}
            </p>
            <label className="small" htmlFor="key"><b>Your Groq API key</b> (stored only in this browser)</label>
            <input id="key" className="field mt" type="password" placeholder="gsk_…" value={userKey} onChange={(e) => setUserKey(e.target.value)} />
            <p className="muted small">Get one free at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>.</p>
            <div className="row between mt">
              <button className="btn ghost sm" onClick={() => { setUserKey(""); save(KEY_STORE, ""); }}>Remove key</button>
              <button className="btn primary" onClick={() => { save(KEY_STORE, userKey.trim()); setShowSettings(false); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Comparison({ runs }: { runs: { original: RunResult; optimized: RunResult } }) {
  const a = runs.original.evaluation.judge?.overall;
  const b = runs.optimized.evaluation.judge?.overall;
  const winner = a != null && b != null ? (b > a ? "optimized" : a > b ? "original" : "tie") : null;
  return (
    <div style={{ marginTop: 18 }}>
      {winner && (
        <div className="delta" style={winner === "original" ? { background: "var(--warn-soft)", color: "var(--warn)" } : undefined}>
          <span>Judge score</span>
          <span className="big">{a}</span>→<span className="big">{b}</span>
          <span>
            {winner === "optimized" ? `Optimized prompt wins by ${b! - a!} points` : winner === "tie" ? "Tie" : "Original scored higher: try another iteration"}
          </span>
        </div>
      )}
      <div className="eval-grid">
        <EvalCard title="Original prompt" run={runs.original} result={runs.original.evaluation} winner={winner === "original"} />
        <EvalCard title="Optimized prompt" run={runs.optimized} result={runs.optimized.evaluation} winner={winner === "optimized"} />
      </div>
    </div>
  );
}

function EvalCard({ title, run, result, winner }: { title: string; run?: RunResult; result: EvalResult; winner?: boolean }) {
  const { metrics, judge } = result;
  return (
    <div className={`eval-card ${winner ? "winner" : ""}`}>
      <div className="row between">
        <b>{title}</b>
        {judge && <span className="badge" style={{ background: "var(--surface-2)", color: scoreColor(judge.overall) }}>{judge.overall}/100</span>}
      </div>
      {judge && (
        <div className="bars mt">
          {Object.entries(judge.scores).map(([k, v]) => <Bar key={k} label={CRITERIA_LABELS[k] ?? k} value={v} />)}
        </div>
      )}
      {judge?.feedback && <p className="small muted">{judge.feedback}</p>}
      <ul className="checks">
        {metrics.checks.map((c) => (
          <li key={c.label}>
            <span>{c.passed ? "✓" : "✗"} {c.label}</span>
            <span className="muted">{c.detail}</span>
          </li>
        ))}
      </ul>
      <div className="stat-row">
        <span><b>{metrics.wordCount}</b> words</span>
        <span>Readability <b>{metrics.readability}</b></span>
        {run && <span><b>{(run.latencyMs / 1000).toFixed(1)}s</b> latency</span>}
        {run?.tokens && <span><b>{run.tokens.completion}</b> tokens</span>}
      </div>
      {result.warning && <div className="notice warn">{result.warning}</div>}
      {run && (
        <details className="mt">
          <summary className="small" style={{ cursor: "pointer" }}>Show response</summary>
          <div className="pane mt"><div className="pane-body prose">{run.response}</div></div>
        </details>
      )}
    </div>
  );
}
