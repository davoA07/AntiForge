"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { Signature, VerificationResult } from "@/lib/engine";
import { formatPercent, formatSeconds } from "@/lib/format";
import { SignatureReplay, replayDuration } from "./signature-replay";

export function VerdictCard({
  result,
  query,
  references,
}: {
  result: VerificationResult;
  query: Signature;
  references: Signature[];
}) {
  const closestIndex = result.distances.indexOf(result.dMin);
  const closest = references[closestIndex] ?? references[0];
  const genuine = result.genuine;

  return (
    <div
      className={`fade-up space-y-5 rounded-2xl border p-5 sm:p-6 ${
        genuine ? "border-verified/50 bg-verified-soft/50" : "border-forged/50 bg-forged-soft/50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {genuine ? (
            <ShieldCheck className="mt-0.5 h-8 w-8 shrink-0 text-verified" />
          ) : (
            <ShieldAlert className="mt-0.5 h-8 w-8 shrink-0 text-forged" />
          )}
          <div>
            <h2 className="font-display text-2xl">
              {genuine ? "Consistent with the enrolled writer" : "Does not match the enrolled writer"}
            </h2>
            <p className="text-sm text-ink-2">
              {genuine
                ? "The trajectory, timing and speed fall inside this writer's own variation."
                : "The way this was written differs from how the enrolled signatures were written."}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl tabular">{formatPercent(result.probability, 0)}</div>
          <div className="text-xs text-ink-3">
            probability genuine · threshold {formatPercent(result.threshold, 0)}
          </div>
        </div>
      </div>

      <DistanceGauge result={result} />

      <ul className="grid gap-2 sm:grid-cols-2">
        {result.factors.map((f) => (
          <li key={f.key} className="flex gap-2.5 rounded-lg border border-line/70 bg-paper/60 p-3 text-sm">
            <span
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                f.severity === "ok" ? "bg-verified" : f.severity === "warn" ? "bg-warn" : "bg-forged"
              }`}
              aria-label={f.severity}
            />
            <div>
              <div className="font-medium">{f.label}</div>
              <div className="text-ink-2">{f.detail}</div>
            </div>
          </li>
        ))}
      </ul>

      <SideBySide query={query} reference={closest} referenceIndex={closestIndex} />
    </div>
  );
}

/**
 * Number line of DTW distances: the shaded band is how far the writer's own
 * references sit from each other; dots are the query's distance to each one.
 */
function DistanceGauge({ result }: { result: VerificationResult }) {
  const max = Math.max(result.dMax, result.intra.max) * 1.15;
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>DTW distance from the enrolled signatures</span>
        <span className="tabular">
          closest {result.dMin.toFixed(3)} · writer&apos;s own spread {result.intra.min.toFixed(3)}–{result.intra.max.toFixed(3)}
        </span>
      </div>
      <div className="relative h-8 rounded-md border border-line bg-paper">
        <div
          className="absolute inset-y-0 rounded-sm bg-verified/20"
          style={{ left: pos(result.intra.min), width: `calc(${pos(result.intra.max)} - ${pos(result.intra.min)})` }}
          title="Range of distances between the enrolled signatures themselves"
        />
        <div
          className="absolute inset-y-0 w-px bg-verified"
          style={{ left: pos(result.intra.mean) }}
          title="Mean distance between enrolled signatures"
        />
        {result.distances.map((d, i) => (
          <div
            key={i}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper ${
              d === result.dMin ? (result.genuine ? "bg-verified" : "bg-forged") : "bg-ink-3"
            }`}
            style={{ left: pos(d) }}
            title={`Distance to reference ${i + 1}: ${d.toFixed(3)}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-ink-3">
        <span>identical</span>
        <span>further apart</span>
      </div>
    </div>
  );
}

function SideBySide({
  query,
  reference,
  referenceIndex,
}: {
  query: Signature;
  reference: Signature;
  referenceIndex: number;
}) {
  const total = Math.max(replayDuration(query), replayDuration(reference));
  const [clock, setClock] = useState(Infinity);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed > total + 400) {
        setClock(Infinity);
        setPlaying(false);
        return;
      }
      setClock(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-3">Replayed in real time, coloured by pen speed (warm = slow)</span>
        <button
          type="button"
          onClick={() => {
            setClock(0);
            setPlaying(true);
          }}
          className="rounded-md border border-line bg-paper px-2.5 py-1 text-xs text-ink-2 hover:text-ink"
        >
          {playing ? "Replaying…" : "Replay both"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReplayPanel title="This attempt" signature={query} clock={clock} />
        <ReplayPanel title={`Closest enrolled signature (#${referenceIndex + 1})`} signature={reference} clock={clock} />
      </div>
    </div>
  );
}

function ReplayPanel({ title, signature, clock }: { title: string; signature: Signature; clock: number }) {
  const penDown = signature.strokes.reduce((acc, s) => {
    const pts = s.points;
    return pts.length ? acc + pts[pts.length - 1].t - pts[0].t : acc;
  }, 0);
  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-ink-3">
        <span>{title}</span>
        <span className="tabular">
          {signature.strokes.length} strokes · {formatSeconds(penDown)} pen-down
        </span>
      </div>
      <SignatureReplay signature={signature} clock={clock} className="h-32" hideControls />
    </div>
  );
}
