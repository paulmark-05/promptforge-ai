"use client";

import { useEffect, useState } from "react";

export interface HeroDemo {
  prompt: string;
  guesses: string[]; // what the prompt leaves the model to guess
  needs: string[]; // what the user said they need
  outcome: "better" | "close" | "worse" | null; // result of the user's own comparison
  live: boolean; // true once the user has analyzed their own prompt
}

const STEPS = [
  { title: "Check your prompt", text: "See what it leaves to guess" },
  { title: "Say what you need", text: "Audience, length, format, tone" },
  { title: "Rewrite it", text: "Built on what you asked for" },
  { title: "Compare the answers", text: "A fair judge scores both" },
];

const OUTCOME_TEXT: Record<NonNullable<HeroDemo["outcome"]>, string> = {
  better: "The judge preferred your version",
  close: "Same quality, and shorter",
  worse: "Try different needs and run again",
};

export function Hero({
  onCheck,
  samples,
  demo,
}: {
  onCheck: (text: string) => void;
  samples: { title: string; prompt: string }[];
  demo: HeroDemo;
}) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);

  // The cards take turns coming forward, telling the before-to-after story.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % 3), 3000);
    return () => clearInterval(id);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) onCheck(text.trim());
  };

  return (
    <section className="hero3" id="top">
      <div className="hero3-bg" aria-hidden>
        <div className="floor" />
        <div className="horizon" />
      </div>

      <div className="hero3-grid">
        <div className="stage" aria-hidden>
          <span className="nbeam n1" />
          <span className="nbeam n2" />
          <span className="nbeam n3" />
          <div className="halo" />
          <div className="stack">
            <Card index={0} active={active} step="01" title="Your prompt">
              <div className="c-prompt">
                {demo.prompt}
                <span className="caret" />
              </div>
              <div className="c-sub">{demo.guesses.length ? "The model has to guess" : "Nothing major left to guess"}</div>
              <div className="c-pills">
                {demo.guesses.map((g, i) => (
                  <span key={g} className="c-pill guess" style={{ "--k": i } as React.CSSProperties}>
                    {g}
                  </span>
                ))}
              </div>
            </Card>

            <Card index={1} active={active} step="02" title="What you need">
              <div className="c-pills">
                {demo.needs.map((n, i) => (
                  <span key={n} className="c-pill need" style={{ "--k": i } as React.CSSProperties}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 8.5l3 3 6-7" />
                    </svg>
                    {n}
                  </span>
                ))}
              </div>
              <div className="c-sub">{demo.live && demo.needs.length === 0 ? "Tell PromptForge in step 2" : "Now the model knows the target"}</div>
            </Card>

            <Card index={2} active={active} step="03" title="The answer you meant">
              <div className="c-compare">
                <div className="c-row">
                  <span className="c-lbl">Vague prompt</span>
                  <div className="lines long">
                    {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--k": i } as React.CSSProperties} />)}
                  </div>
                </div>
                <div className="c-row">
                  <span className="c-lbl hot">With your needs</span>
                  <div className="lines short">
                    {Array.from({ length: 3 }, (_, i) => <i key={i} style={{ "--k": i } as React.CSSProperties} />)}
                  </div>
                </div>
              </div>
              <div className="c-verdict">
                <span className="tick-dot">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                </span>
                {demo.outcome ? OUTCOME_TEXT[demo.outcome] : "Fits what you asked, without the padding"}
              </div>
            </Card>
          </div>
        </div>

        <div className="hero3-copy">
          <h1>
            Say what you need.
            <br />
            Get the answer you <span className="neon-word">meant</span>.
          </h1>
          <p className="lede">
            A vague prompt makes the model guess, so you get a long, generic answer. PromptForge shows what your prompt leaves out,
            helps you say it, and proves the difference side by side.
          </p>

          <form className="try" onSubmit={submit}>
            <input
              aria-label="Your prompt"
              placeholder="Type any prompt, e.g. explain machine learning"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={6000}
            />
            <button type="submit" className="try-go" disabled={!text.trim()}>
              <span>Check it</span>
              <span className="knob" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5l8 8M13 6v7H6" />
                </svg>
              </span>
            </button>
          </form>

          <div className="try-samples">
            <span>Or try</span>
            {samples.map((s) => (
              <button key={s.title} className="chip" onClick={() => onCheck(s.prompt)}>
                {s.prompt.length > 34 ? `${s.prompt.slice(0, 32)}…` : s.prompt}
              </button>
            ))}
          </div>

          <ol className="how3">
            {STEPS.map((s, i) => (
              <li key={s.title} style={{ "--i": i } as React.CSSProperties}>
                <span className="how-n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <b>{s.title}</b>
                  <span>{s.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Card({ index, active, step, title, children }: { index: number; active: number; step: string; title: string; children: React.ReactNode }) {
  return (
    <div className={`card3 k${index} ${active === index ? "active" : ""}`}>
      <div className="card3-head">
        <span className="card3-step">{step}</span>
        <span className="card3-title">{title}</span>
      </div>
      {children}
      <span className="sheen" />
    </div>
  );
}
