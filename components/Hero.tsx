"use client";

import { useEffect, useRef, useState } from "react";

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
  onOpen,
  samples,
  demo,
}: {
  onCheck: (text: string) => void;
  onOpen: (card: 0 | 1 | 2) => void; // a card was clicked
  samples: { title: string; prompt: string }[];
  demo: HeroDemo;
}) {
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(0); // where the timed story is
  const [held, setHeld] = useState<number | null>(null); // card the visitor is pointing at
  const active = held ?? auto;
  const tiltRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The cards take turns coming forward, telling the before-to-after story.
  // While a card is held (hovered or focused) it stays in front; when the
  // visitor leaves, the story carries on from that card.
  useEffect(() => {
    if (held !== null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setAuto((a) => (a + 1) % 3), 3000);
    return () => clearInterval(id);
  }, [held]);

  const heldRef = useRef<number | null>(null);
  function hold(index: number) {
    heldRef.current = index;
    setHeld(index);
  }
  function release() {
    if (heldRef.current !== null) setAuto(heldRef.current);
    heldRef.current = null;
    setHeld(null);
  }

  // Gentle 3D tilt toward the pointer (mouse only, off for reduced motion).
  function tilt(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tiltRef.current?.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
    tiltRef.current?.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
  }
  function leave() {
    release();
    tiltRef.current?.style.setProperty("--ry", "0deg");
    tiltRef.current?.style.setProperty("--rx", "0deg");
  }
  const cardProps = (index: 0 | 1 | 2) => ({
    index,
    active,
    hint: demo.live ? "Open step" : index === 0 ? "Try it" : "Type yours",
    onFocus: () => hold(index),
    onBlur: release,
    onOpen: () => openCard(index),
  });
  // Before the visitor has a prompt, cards 2 and 3 invite them to type one.
  function openCard(index: 0 | 1 | 2) {
    if (!demo.live && index > 0) inputRef.current?.focus();
    else onOpen(index);
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) onCheck(text.trim());
  };

  return (
    <section className="hero3" id="top">
      <div className="hero3-bg" aria-hidden>
        <div className="sky" />
        <div className="sun" />
        <div className="floor" />
      </div>

      <div className="hero3-grid">
        <div className={`stage ${held !== null ? "hovering" : ""}`} onPointerMove={tilt} onPointerLeave={leave}>
          <span className="nbeam n1" aria-hidden />
          <span className="nbeam n2" aria-hidden />
          <span className="nbeam n3" aria-hidden />
          <div className="halo" aria-hidden />
          <div className="tilt" ref={tiltRef}>
          <div className="stack">
            <Card {...cardProps(0)} step="01" title="Your prompt">
              <div className="c-prompt">
                {demo.prompt}
                <span className="caret" />
              </div>
              <div className="c-sub">{demo.guesses.length ? "Left for the model to guess" : "Nothing important left to guess"}</div>
              <div className="c-pills">
                {demo.guesses.map((g, i) => (
                  <span key={g} className="c-pill guess" style={{ "--k": i } as React.CSSProperties}>
                    <b className="q">?</b>
                    {g}
                  </span>
                ))}
              </div>
            </Card>

            <Card {...cardProps(1)} step="02" title="What you need">
              <div className="c-pills">
                {demo.live && demo.needs.length === 0 && <span className="c-pill empty">Pick them in step 2</span>}
                {demo.needs.map((n, i) => (
                  <span key={n} className="c-pill need" style={{ "--k": i } as React.CSSProperties}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 8.5l3 3 6-7" />
                    </svg>
                    {n}
                  </span>
                ))}
              </div>
              <div className="c-sub">{demo.live && demo.needs.length === 0 ? "Audience, length, format, tone" : "No more guessing: the target is clear"}</div>
            </Card>

            <Card {...cardProps(2)} step="03" title="The result">
              <div className="c-compare">
                <div className="c-row">
                  <span className="c-lbl">Vague prompt<small>long, generic</small></span>
                  <div className="lines long">
                    {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--k": i } as React.CSSProperties} />)}
                  </div>
                </div>
                <div className="c-row">
                  <span className="c-lbl hot">With your needs<small>to the point</small></span>
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
                {demo.outcome ? OUTCOME_TEXT[demo.outcome] : "Exactly what you asked for"}
              </div>
            </Card>
          </div>
          </div>
          <div className="hits" aria-hidden>
            {([0, 1, 2] as const).map((i) => (
              <span key={i} onPointerEnter={() => hold(i)} onClick={() => openCard(i)} />
            ))}
          </div>
          <p className="stage-hint" aria-hidden>{held !== null ? "Click to open" : "Hover a card"}</p>
        </div>

        <div className="hero3-copy">
          <h1>
            Say what you need.
            <br />
            Get the answer you <span className="neon-word">meant</span>.
          </h1>
          <p className="lede">
            A vague prompt makes the model guess, so you get a long, generic answer. <em className="brand-em">PromptForge</em> shows what your prompt leaves out,
            helps you say it, and proves the difference side by side.
          </p>

          <form className="try" onSubmit={submit}>
            <input
              ref={inputRef}
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

function Card({
  index,
  active,
  step,
  title,
  hint,
  onFocus,
  onBlur,
  onOpen,
  children,
}: {
  index: number;
  active: number;
  step: string;
  title: string;
  hint: string;
  onFocus: () => void;
  onBlur: () => void;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`card3 k${index} ${active === index ? "active" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${title}: ${hint}`}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="card3-head">
        <span className="card3-step">{step}</span>
        <span className="card3-title">{title}</span>
        <span className="card3-hint">
          {hint}
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </span>
      </div>
      {children}
      <span className="sheen" />
    </div>
  );
}
