"use client";

export function scoreColor(score: number, max = 100) {
  const pct = score / max;
  return pct >= 0.7 ? "var(--good)" : pct >= 0.45 ? "var(--warn)" : "var(--bad)";
}

export function ScoreRing({ score, size = 132, label }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .6s ease" }}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.28} fontWeight="700" fill="var(--text)">
        {score}
      </text>
      <text x="50%" y="68%" textAnchor="middle" fontSize="11" fill="var(--muted)">
        {label ?? "/ 100"}
      </text>
    </svg>
  );
}

export function Bar({ label, value, max = 10, hint }: { label: string; value: number; max?: number; hint?: string }) {
  return (
    <div className="bar-row" title={hint}>
      <span>{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${(value / max) * 100}%`, background: scoreColor(value, max) }} />
      </div>
      <span className="val">{value}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function SeverityBadge({ severity }: { severity: "high" | "medium" | "low" }) {
  const cls = severity === "high" ? "bad" : severity === "medium" ? "warn" : "neutral";
  return <span className={`badge ${cls} sev`}>{severity}</span>;
}
