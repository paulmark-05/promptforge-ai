"use client";

import { DIMENSIONS, type Analysis } from "../lib/analyzer";
import { Logo, scoreTone, useCountUp } from "./ui";

// The 8 scoring dimensions wired into the analyzer core. Before a prompt is
// analyzed each node shows its weight; afterwards it shows the prompt's score.
const W = 1040;
const H = 380;
const NODE_W = 168;
const NODE_H = 44;
const CORE = { x: 450, y: 120, w: 140, h: 140 };
const ROWS = [36, 124, 212, 300];

export function HeroCircuit({ analysis }: { analysis: Analysis | null }) {
  const score = useCountUp(analysis?.score ?? 0);
  const byKey = Object.fromEntries((analysis?.dimensions ?? []).map((d) => [d.key, d.score]));

  const nodes = DIMENSIONS.map((d, i) => {
    const left = i < 4;
    const row = i % 4;
    const x = left ? 24 : W - 24 - NODE_W;
    const y = ROWS[row];
    const cy = y + NODE_H / 2;
    const entryY = CORE.y + 28 + row * 28; // spread wires along the core edge
    const startX = left ? x + NODE_W : x;
    const bendX = left ? 330 : W - 330;
    const endX = left ? CORE.x : CORE.x + CORE.w;
    return { ...d, left, x, y, cy, entryY, path: wire(startX, cy, bendX, entryY, endX), delay: `${(i * 0.45).toFixed(2)}s` };
  });

  return (
    <div className="circuit" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`}>
        {nodes.map((n) => (
          <path key={`w-${n.key}`} className="wire" d={n.path} />
        ))}
        {nodes.map((n) => (
          <path key={`p-${n.key}`} className="pulse" d={n.path} pathLength={400} style={{ "--d": n.delay } as React.CSSProperties} />
        ))}
        {nodes.map((n) => {
          const val = byKey[n.key];
          const tone = val == null ? "" : scoreTone(val, 10);
          return (
            <g key={n.key} className={`node lit ${tone}`} style={{ "--d": n.delay } as React.CSSProperties}>
              <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={10} />
              <text x={n.x + 16} y={n.cy + 4.5}>{n.label}</text>
              <text className="val" x={n.x + NODE_W - 16} y={n.cy + 4.5} textAnchor="end">
                {val == null ? `${n.weight}%` : val}
              </text>
            </g>
          );
        })}
        <rect className="core-ring" x={CORE.x - 10} y={CORE.y - 10} width={CORE.w + 20} height={CORE.h + 20} rx={30} />
        <rect className="core-box" x={CORE.x} y={CORE.y} width={CORE.w} height={CORE.h} rx={24} />
        {analysis ? (
          <>
            <text className="core-score" x={CORE.x + CORE.w / 2} y={CORE.y + 76} textAnchor="middle">{score}</text>
            <text className="core-label" x={CORE.x + CORE.w / 2} y={CORE.y + 102} textAnchor="middle">SCORE</text>
          </>
        ) : (
          <>
            <foreignObject x={CORE.x + CORE.w / 2 - 18} y={CORE.y + 36} width={36} height={36}>
              <Logo size={36} />
            </foreignObject>
            <text className="core-label" x={CORE.x + CORE.w / 2} y={CORE.y + 102} textAnchor="middle">ANALYZER</text>
          </>
        )}
      </svg>
    </div>
  );
}

// Orthogonal wire with rounded corners: horizontal, vertical, horizontal.
function wire(x1: number, y1: number, bx: number, y2: number, x2: number) {
  const r = Math.min(12, Math.abs(y2 - y1) / 2);
  const dx = Math.sign(bx - x1);
  const dy = Math.sign(y2 - y1);
  if (dy === 0) return `M${x1},${y1} H${x2}`;
  return [
    `M${x1},${y1}`,
    `H${bx - dx * r}`,
    `Q${bx},${y1} ${bx},${y1 + dy * r}`,
    `V${y2 - dy * r}`,
    `Q${bx},${y2} ${bx + dx * r},${y2}`,
    `H${x2}`,
  ].join(" ");
}
