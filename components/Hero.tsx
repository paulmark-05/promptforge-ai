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

// In the demo, answering a question on card 1 turns it into a need on card 2.
const DEMO_ANSWERS: Record<string, string> = {
  "Who is it for?": "For a beginner",
  "How long?": "Under 100 words",
  "What format?": "Bullet points",
};

const Check = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

export function Hero({
  onCheck,
  onJump,
  samples,
  demo,
}: {
  onCheck: (text: string) => void;
  onJump: (card: 0 | 1 | 2) => void;
  samples: { title: string; prompt: string }[];
  demo: HeroDemo;
}) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [resolved, setResolved] = useState<number[]>([]); // demo: answered questions, in order
  const [auto, setAuto] = useState(true); // plays by itself until the user takes over
  const [hovering, setHovering] = useState(false);
  const [spark, setSpark] = useState(0); // bumps to replay the spark animation
  const tiltRef = useRef<HTMLDivElement>(null);
  const hold = useRef(0);
  const resolvedRef = useRef<number[]>([]);
  resolvedRef.current = resolved;

  const live = demo.live;
  const guesses = demo.guesses;
  const allResolved = !live && resolved.length >= guesses.length;
  const needs = live ? demo.needs : resolved.map((i) => DEMO_ANSWERS[guesses[i]] ?? guesses[i]);

  // Switching between demo and the user's own prompt starts the story over.
  useEffect(() => {
    setResolved([]);
    setActive(0);
    setAuto(true);
  }, [live]);

  // Autoplay: answer one question at a time, show the result, hold, then replay.
  useEffect(() => {
    if (!auto || hovering || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (live) {
        setActive((a) => (a + 1) % 3);
        return;
      }
      const r = resolvedRef.current;
      if (r.length < guesses.length) {
        hold.current = 0;
        setResolved([...r, r.length]);
        setActive(1);
        setSpark((s) => s + 1);
        return;
      }
      hold.current += 1;
      if (hold.current === 1) setActive(2);
      if (hold.current >= 3) {
        hold.current = 0;
        setActive(0);
        setResolved([]);
      }
    }, 1700);
    return () => clearInterval(id);
  }, [auto, hovering, live, guesses.length]);

  function answer(i: number) {
    if (live) {
      onJump(1);
      return;
    }
    setAuto(false);
    if (resolved.includes(i)) return;
    const next = [...resolved, i];
    setResolved(next);
    setActive(1);
    setSpark((s) => s + 1);
    if (next.length >= guesses.length) setTimeout(() => setActive(2), 900);
  }

  function pick(card: 0 | 1 | 2) {
    setAuto(false);
    setActive(card);
    if (live) onJump(card);
  }

  function replay() {
    hold.current = 0;
    setResolved([]);
    setActive(0);
    setAuto(true);
  }

  // Gentle 3D tilt toward the pointer (mouse only, off for reduced motion).
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tiltRef.current?.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
    tiltRef.current?.style.setProperty("--rx", `${(-y * 5).toFixed(2)}deg`);
  }
  function onLeave() {
    setHovering(false);
    tiltRef.current?.style.setProperty("--ry", "0deg");
    tiltRef.current?.style.setProperty("--rx", "0deg");
  }

  const verdict = live
    ? demo.outcome
      ? OUTCOME_TEXT[demo.outcome]
      : demo.needs.length
        ? "Rewrite it, then compare the answers"
        : "Say what you need to get here"
    : allResolved
      ? "Fits what you asked, without the padding"
      : resolved.length
        ? "Getting closer: keep answering"
        : "Still guessing, so it pads the answer";

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
        <div
          className={`stage ${hovering ? "hovering" : ""}`}
          role="group"
          aria-label="Interactive example: from a vague prompt to the answer you meant"
          onPointerEnter={() => setHovering(true)}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          <span className="nbeam n1" aria-hidden />
          <span className="nbeam n2" aria-hidden />
          <span className="nbeam n3" aria-hidden />
          <div className="halo" aria-hidden />

          <div className="tilt" ref={tiltRef}>
            <div className="stack">
              <Card index={0} active={active} step="01" title="Your prompt" onPick={pick}>
                <div className="c-prompt">
                  {demo.prompt}
                  <span className="caret" aria-hidden />
                </div>
                <div className="c-sub">
                  {guesses.length ? (live ? "The model has to guess. Answer these in step 2" : "The model has to guess. Click to answer") : "Nothing major left to guess"}
                </div>
                <div className="c-pills">
                  {guesses.map((g, i) => {
                    const done = resolved.includes(i);
                    return (
                      <button
                        key={g}
                        type="button"
                        className={`c-pill guess ${done ? "done" : ""}`}
                        style={{ "--k": i } as React.CSSProperties}
                        onClick={(e) => {
                          e.stopPropagation();
                          answer(i);
                        }}
                        aria-pressed={done}
                      >
                        {done ? <Check /> : <span className="plus" aria-hidden>+</span>}
                        {g}
                      </button>
                    );
                  })}
                </div>
              </Card>

              <Card index={1} active={active} step="02" title="What you need" onPick={pick}>
                <div className="c-pills needs-row">
                  {needs.length === 0 && <span className="c-empty">{live ? "Nothing confirmed yet" : "Answer a question on card 1"}</span>}
                  {needs.map((n, i) => (
                    <span key={n} className="c-pill need" style={{ "--k": live ? i : 0 } as React.CSSProperties}>
                      <Check />
                      {n}
                    </span>
                  ))}
                </div>
                <div className="c-sub">{needs.length ? "Now the model knows the target" : "The model cannot read your mind"}</div>
              </Card>

              <Card index={2} active={active} step="03" title="The answer you meant" onPick={pick} ready={live ? Boolean(demo.outcome) || demo.needs.length > 0 : allResolved}>
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
                  <span className="tick-dot"><Check size={12} /></span>
                  {verdict}
                </div>
              </Card>

              {!live && <span key={spark} className={`spark ${spark ? "go" : ""}`} aria-hidden />}
            </div>
          </div>

          <div className="stage-foot">
            <div className="dots" role="tablist" aria-label="Cards">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={active === i}
                  aria-label={`Card ${i + 1}`}
                  className={`sdot ${active === i ? "on" : ""}`}
                  onClick={() => pick(i as 0 | 1 | 2)}
                />
              ))}
            </div>
            <span className="stage-hint">
              {live ? "Click a card to open that step" : auto || resolved.length === 0 ? "Click a question to try it yourself" : allResolved ? "That is the whole idea" : "Keep going"}
            </span>
            {!live && !auto && (
              <button type="button" className="replay" onClick={replay}>Replay</button>
            )}
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

function Card({
  index,
  active,
  step,
  title,
  ready,
  onPick,
  children,
}: {
  index: 0 | 1 | 2;
  active: number;
  step: string;
  title: string;
  ready?: boolean;
  onPick: (card: 0 | 1 | 2) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`card3 k${index} ${active === index ? "active" : ""} ${ready ? "ready" : ""}`} onClick={() => onPick(index)}>
      <button type="button" className="card3-head" onClick={(e) => { e.stopPropagation(); onPick(index); }} aria-label={`Show card ${index + 1}: ${title}`}>
        <span className="card3-step">{step}</span>
        <span className="card3-title">{title}</span>
      </button>
      {children}
      <span className="sheen" aria-hidden />
    </div>
  );
}
