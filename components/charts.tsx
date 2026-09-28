"use client";

// Small, dependency-free charts for before -> after analytics.
// Colors: Original = palette slot 1 (blue), Optimized = slot 2 (orange), dark-mode steps,
// validated on the app surface (lightness band, chroma floor, CVD and contrast all pass).
// Text always uses text tokens; the colored marks carry identity, and a legend is always shown.

import { useState } from "react";

export const SERIES = {
  a: { name: "Original", color: "#3987e5" },
  b: { name: "Optimized", color: "#d95926" },
};

export function Legend({ a = SERIES.a.name, b = SERIES.b.name }: { a?: string; b?: string }) {
  return (
    <div className="legend" aria-hidden>
      <span><i style={{ background: SERIES.a.color }} />{a}</span>
      <span><i style={{ background: SERIES.b.color }} />{b}</span>
    </div>
  );
}

export interface DumbbellRow {
  label: string;
  a: number;
  b: number;
  note?: string;
}

// Before -> after per item. One row per criterion; a line joins the two dots.
export function Dumbbell({ title, subtitle, rows, max = 10, unit = "", legendA, legendB }: {
  title: string;
  subtitle?: string;
  rows: DumbbellRow[];
  max?: number;
  unit?: string;
  legendA?: string;
  legendB?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const pct = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const up = rows.filter((r) => r.b > r.a).length;
  const down = rows.filter((r) => r.b < r.a).length;
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <div>
          <b>{title}</b>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="chart-tools">
          <Legend a={legendA} b={legendB} />
          <button className="chart-toggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Chart" : "Table"}</button>
        </div>
      </figcaption>
      {table ? (
        <table className="chart-table">
          <thead><tr><th>Criterion</th><th>{legendA ?? SERIES.a.name}</th><th>{legendB ?? SERIES.b.name}</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td>{fmt(r.a)}{unit}</td><td>{fmt(r.b)}{unit}</td><td>{delta(r.b - r.a, fmt)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="db" role="img" aria-label={`${title}: ${up} improved, ${down} lower, ${rows.length - up - down} unchanged`} onPointerLeave={() => setHover(null)}>
          <div className="db-axis" aria-hidden>
            {[0, 0.5, 1].map((t) => <span key={t} style={{ left: `${t * 100}%` }}>{fmt(max * t)}</span>)}
          </div>
          {rows.map((r, i) => {
            const lo = Math.min(r.a, r.b);
            const hi = Math.max(r.a, r.b);
            return (
              <div key={r.label} className={`db-row ${hover === i ? "hot" : ""}`} onPointerEnter={() => setHover(i)} style={{ "--i": i } as React.CSSProperties}>
                <span className="db-label">{r.label}</span>
                <div className="db-track">
                  {[0.25, 0.5, 0.75].map((t) => <i key={t} className="db-grid" style={{ left: `${t * 100}%` }} />)}
                  <i className="db-link" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} />
                  <i className="db-dot" style={{ left: pct(r.a), background: SERIES.a.color }} />
                  {/* Equal scores: one split dot so neither series disappears behind the other */}
                  <i className="db-dot" style={{ left: pct(r.b), background: Math.abs(r.a - r.b) < 0.05 ? `linear-gradient(90deg, ${SERIES.a.color} 50%, ${SERIES.b.color} 50%)` : SERIES.b.color }} />
                  {hover === i && (
                    <span className="db-tip" style={{ left: pct(hi) }}>
                      <b>{r.label}</b>
                      <span><i style={{ background: SERIES.a.color }} />{legendA ?? SERIES.a.name} {fmt(r.a)}{unit}</span>
                      <span><i style={{ background: SERIES.b.color }} />{legendB ?? SERIES.b.name} {fmt(r.b)}{unit}</span>
                      {r.note && <em>{r.note}</em>}
                    </span>
                  )}
                </div>
                <span className="db-val">{fmt(r.a)} → <b>{fmt(r.b)}</b></span>
                <span className="db-delta">{delta(r.b - r.a, fmt)}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="chart-foot">{up} improved · {down} lower · {rows.length - up - down} unchanged</p>
    </figure>
  );
}

// Change with a glyph so it never relies on color alone.
function delta(d: number, fmt: (v: number) => string) {
  if (Math.abs(d) < 0.05) return <span className="chg same">= 0</span>;
  return <span className={`chg ${d > 0 ? "up" : "down"}`}>{d > 0 ? "▲ +" : "▼ "}{fmt(d)}</span>;
}

// Small multiples: one paired bar per measure, each on its own scale (different units).
export function PairBars({ title, items }: { title: string; items: { label: string; a: number; b: number; unit: string; lowerIsBetter?: boolean; format?: (v: number) => string }[] }) {
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <div><b>{title}</b><span>Each measure on its own scale</span></div>
        <div className="chart-tools"><Legend /></div>
      </figcaption>
      <div className="pb-grid">
        {items.map((it) => {
          const m = Math.max(it.a, it.b, 1e-9);
          const f = it.format ?? ((v: number) => String(Math.round(v)));
          const change = it.a > 0 ? (it.b - it.a) / it.a : 0;
          const better = it.lowerIsBetter ? change < 0 : change > 0;
          return (
            <div key={it.label} className="pb">
              <div className="pb-head"><span>{it.label}</span><span className={`chg ${Math.abs(change) < 0.005 ? "same" : better ? "up" : "down"}`}>{Math.abs(change) < 0.005 ? "= same" : `${change > 0 ? "▲" : "▼"} ${Math.abs(Math.round(change * 100))}%`}</span></div>
              {(["a", "b"] as const).map((k) => (
                <div key={k} className="pb-row" title={`${SERIES[k].name}: ${f(it[k])} ${it.unit}`}>
                  <div className="pb-track"><i style={{ width: `${(it[k] / m) * 100}%`, background: SERIES[k].color }} /></div>
                  <span>{f(it[k])} <small>{it.unit}</small></span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
