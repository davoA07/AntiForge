import { BENCH } from "@/lib/bench";
import { formatPercent } from "@/lib/format";

/** Inline ROC curves from the committed benchmark summary. */
export function RocChart({ className }: { className?: string }) {
  const W = 320;
  const H = 300;
  const m = { top: 12, right: 12, bottom: 34, left: 40 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;
  const sx = (v: number) => m.left + v * pw;
  const sy = (v: number) => m.top + (1 - v) * ph;
  const path = (pts: [number, number][]) =>
    pts.map(([far, tar], i) => `${i ? "L" : "M"}${sx(far).toFixed(1)} ${sy(tar).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const t1 = BENCH.tasks.task1;
  const t2 = BENCH.tasks.task2;
  const series = [
    { label: `Task 2 skilled · EER ${formatPercent(t2.skilled.eer)}`, d: path(t2.roc.skilled), color: "var(--accent)", dash: "" },
    { label: `Task 1 skilled · EER ${formatPercent(t1.skilled.eer)}`, d: path(t1.roc.skilled), color: "var(--forged)", dash: "" },
    { label: `Task 2 random · EER ${formatPercent(t2.random.eer)}`, d: path(t2.roc.random), color: "var(--accent)", dash: "5 4" },
    { label: `Task 1 random · EER ${formatPercent(t1.random.eer)}`, d: path(t1.roc.random), color: "var(--forged)", dash: "5 4" },
  ];

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="ROC curves on SVC2004">
        {ticks.map((t) => (
          <g key={t} className="text-ink-3">
            <line x1={sx(t)} x2={sx(t)} y1={m.top} y2={m.top + ph} stroke="var(--line)" strokeWidth={1} />
            <line x1={m.left} x2={m.left + pw} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={sx(t)} y={m.top + ph + 14} textAnchor="middle" fontSize={9} fill="currentColor">
              {t}
            </text>
            <text x={m.left - 6} y={sy(t) + 3} textAnchor="end" fontSize={9} fill="currentColor">
              {t}
            </text>
          </g>
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--line)" strokeDasharray="3 3" />
        {series.map((s) => (
          <path key={s.label} d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} strokeLinejoin="round" />
        ))}
        <text x={m.left + pw / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--ink-2)">
          false accept rate
        </text>
        <text transform={`translate(10 ${m.top + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill="var(--ink-2)">
          true accept rate
        </text>
      </svg>
      <figcaption className="mt-2 grid grid-cols-1 gap-1 text-xs text-ink-2 sm:grid-cols-2">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <svg width="22" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="22" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
