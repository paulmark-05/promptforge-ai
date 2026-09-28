"use client";

import { HERO_STATS } from "../lib/results";
import { useCountUp } from "./ui";

const STEPS = [
  { title: "Check your prompt", text: "See what it leaves the model to guess." },
  { title: "Say what you need", text: "Audience, purpose, length, format, tone." },
  { title: "Rewrite it", text: "Proven techniques, built on your needs." },
  { title: "Compare the answers", text: "A fair judge scores both, plus the cost." },
];

export function Hero({ onStart, onSample }: { onStart: () => void; onSample: () => void }) {
  return (
    <section className="hero2" id="top">
      <div className="beams" aria-hidden>
        <span className="beam b1" />
        <span className="beam b2" />
        <span className="beam b3" />
        <span className="column" />
        <Arcs />
      </div>

      <div className="tiles">
        {HERO_STATS.map((s, i) => (
          <Tile key={s.label} {...s} index={i} />
        ))}
      </div>

      <div className="hero-copy">
        <h1>
          Say what you need.
          <br />
          Get the answer you meant.
        </h1>
        <p className="lede">
          A vague prompt makes the model guess. PromptForge shows what your prompt leaves out, helps you say it, rewrites the
          prompt, and proves the difference by comparing both answers.
        </p>
        <div className="hero-actions">
          <button className="cta" onClick={onStart}>
            <span>Check a prompt</span>
            <span className="knob" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 5l8 8M13 6v7H6" />
              </svg>
            </span>
          </button>
          <button className="btn lg" onClick={onSample}>Try a sample</button>
        </div>
      </div>

      <ol className="how">
        {STEPS.map((s, i) => (
          <li key={s.title} style={{ "--i": i } as React.CSSProperties}>
            <span className="how-n">{String(i + 1).padStart(2, "0")}</span>
            <b>{s.title}</b>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Tile({ value, prefix = "", suffix = "", label, note, index }: (typeof HERO_STATS)[number] & { index: number }) {
  const n = useCountUp(value, 1400);
  return (
    <div className={`tile t${index}`} style={{ "--i": index } as React.CSSProperties}>
      <span className="tile-num">
        {prefix}
        {n}
        {suffix}
      </span>
      <span className="tile-label">{label}</span>
      {note && <span className="tile-note">{note}</span>}
    </div>
  );
}

// Light lines sweeping out from the centre, like the beams spreading on a floor.
function Arcs() {
  const curves = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg className="arcs" viewBox="0 0 1200 360" preserveAspectRatio="none">
      <defs>
        <linearGradient id="arcFade" x1="0" x2="1">
          <stop offset="0" stopColor="#ff6b2c" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffb07a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff6b2c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {curves.map((i) => {
        const spread = 60 + i * 26;
        const d = `M ${600 - 560 - i * 10} ${360 - i * 6} C ${600 - spread * 2} ${220 - i * 8}, ${600 - 30} ${120 + i * 6}, 600 0 C ${600 + 30} ${120 + i * 6}, ${600 + spread * 2} ${220 - i * 8}, ${600 + 560 + i * 10} ${360 - i * 6}`;
        return (
          <g key={i}>
            <path d={d} className="arc" style={{ opacity: 0.12 + i * 0.05 }} />
            <path d={d} className="arc-flow" pathLength={100} style={{ animationDelay: `${i * 0.35}s` }} />
          </g>
        );
      })}
    </svg>
  );
}
