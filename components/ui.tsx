"use client";

import { useEffect, useRef, useState } from "react";

export function scoreColor(score: number, max = 100) {
  const pct = score / max;
  return pct >= 0.7 ? "var(--good)" : pct >= 0.45 ? "var(--warn)" : "var(--bad)";
}

export function scoreTone(score: number, max = 100): "good" | "warn" | "bad" {
  const pct = score / max;
  return pct >= 0.7 ? "good" : pct >= 0.45 ? "warn" : "bad";
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Animates a number from its previous value to the new one.
export function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(origin + (target - origin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}

export function ScoreRing({ score, size = 148 }: { score: number; size?: number }) {
  const shown = useCountUp(score);
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - drawn / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.7,.2,1), stroke .3s" }}
      />
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.3} fontWeight="700" fill="var(--text)" style={{ letterSpacing: "-0.04em" }}>
        {shown}
      </text>
      <text x="50%" y="67%" textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="var(--mono)">
        / 100
      </text>
    </svg>
  );
}

export function Bar({ label, value, max = 10, hint, index = 0 }: { label: string; value: number; max?: number; hint?: string; index?: number }) {
  const style = { "--w": `${(value / max) * 100}%`, "--i": index, background: scoreColor(value, max) } as React.CSSProperties;
  return (
    <div className="bar-row" title={hint}>
      <span>{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={style} />
      </div>
      <span className="val">{value}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function SeverityTag({ severity }: { severity: "high" | "medium" | "low" }) {
  const cls = severity === "high" ? "bad" : severity === "medium" ? "warn" : "";
  return <span className={`tag ${cls} sev`}>{severity}</span>;
}

/* Small hand-drawn icons, 16px, stroke uses currentColor. */
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
  arrow: () => (
    <svg {...base}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
  ),
  check: ({ size = 16 }: { size?: number }) => (
    <svg {...base} width={size} height={size}><path d="M3.5 8.5l3 3 6-7" /></svg>
  ),
  copy: () => (
    <svg {...base}><rect x="5.5" y="5.5" width="8" height="8" rx="2" /><path d="M10.5 5.5V4a1.5 1.5 0 00-1.5-1.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" /></svg>
  ),
  loop: () => (
    <svg {...base}><path d="M13 5.5A5.5 5.5 0 003.2 6M3 10.5A5.5 5.5 0 0012.8 10" /><path d="M13 2.5v3h-3M3 13.5v-3h3" /></svg>
  ),
  key: () => (
    <svg {...base}><circle cx="5.5" cy="10.5" r="3" /><path d="M7.7 8.3L13.5 2.5M11.5 4.5l1.5 1.5M10 6l1.2 1.2" /></svg>
  ),
  play: () => (
    <svg {...base}><path d="M5 3.5v9l7.5-4.5z" /></svg>
  ),
  chevron: () => (
    <svg {...base} width={14} height={14}><path d="M6 4l4 4-4 4" /></svg>
  ),
  alert: () => (
    <svg {...base}><path d="M8 2.5l6 10.5H2z" /><path d="M8 7v2.5M8 11.3v.2" /></svg>
  ),
};

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M9 22h14M11 22l2-8h6l2 8M13 14l3-5 3 5" fill="none" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
