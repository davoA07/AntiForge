"use client";

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Signature } from "@/lib/engine";

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** ms since the first sample */
  t: number;
  /** device units per ms */
  speed: number;
}

export interface SignatureReplayProps {
  signature: Signature;
  /** Start playing as soon as it mounts. */
  autoplay?: boolean;
  loop?: boolean;
  /** Playback rate; 1 = real time. */
  rate?: number;
  /** Colour segments by pen speed (slow = warm, fast = ink). */
  colorBySpeed?: boolean;
  className?: string;
  /** Hide the play control (used for side-by-side comparisons driven from outside). */
  hideControls?: boolean;
  /** External clock in ms; when set, the component is fully controlled. */
  clock?: number;
}

/**
 * Replays a captured signature in real time as an SVG, one segment at a time,
 * optionally coloured by speed. Because pauses between strokes are kept, a
 * traced forgery visibly crawls where the original flowed.
 */
export function SignatureReplay({
  signature,
  autoplay = false,
  loop = false,
  rate = 1,
  colorBySpeed = true,
  className,
  hideControls = false,
  clock,
}: SignatureReplayProps) {
  const { segments, viewBox, total, speedScale } = useMemo(
    () => prepare(signature),
    [signature],
  );
  const [internalClock, setInternalClock] = useState<number>(autoplay ? 0 : Infinity);
  const [playing, setPlaying] = useState(autoplay);
  const frame = useRef<number>(0);
  const controlled = clock !== undefined;
  const now = controlled ? clock : internalClock;

  useEffect(() => {
    if (controlled || !playing) return;
    let start = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - start) * rate;
      if (elapsed >= total + 500) {
        if (loop) {
          start = performance.now() + 400 / rate; // brief hold before restarting
          setInternalClock(0);
          frame.current = requestAnimationFrame(tick);
          return;
        }
        setInternalClock(Infinity);
        setPlaying(false);
        return;
      }
      setInternalClock(Math.max(0, elapsed));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, controlled, rate, total, loop]);

  const replay = () => {
    setInternalClock(0);
    setPlaying(true);
  };

  const visible = segments.filter((s) => s.t <= now);
  const head = visible.length > 0 && now < total ? visible[visible.length - 1] : null;

  return (
    <div className={`relative ${className ?? ""}`}>
      <svg viewBox={viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {visible.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={colorBySpeed ? speedColor(s.speed / speedScale) : "currentColor"}
            strokeWidth={2.4}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {head && (
          <circle cx={head.x2} cy={head.y2} r={4} fill="var(--accent)" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {!hideControls && !controlled && (
        <button
          type="button"
          onClick={replay}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md border border-line bg-paper/90 px-2 py-1 text-xs text-ink-2 hover:text-ink"
          aria-label="Replay signature"
        >
          {now === Infinity || now >= total ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Replay
        </button>
      )}
    </div>
  );
}

/** Total replay length in ms, exported so parents can drive several replays with one clock. */
export function replayDuration(signature: Signature): number {
  return prepare(signature).total;
}

function prepare(sig: Signature) {
  const segments: Segment[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let t0 = Infinity;
  let tEnd = -Infinity;
  for (const s of sig.strokes) {
    for (const p of s.points) {
      if (p.t < t0) t0 = p.t;
      if (p.t > tEnd) tEnd = p.t;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(t0)) {
    return { segments, viewBox: "0 0 1 1", total: 0, speedScale: 1 };
  }
  const speeds: number[] = [];
  for (const s of sig.strokes) {
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1];
      const b = s.points[i];
      const dt = Math.max(b.t - a.t, 1);
      const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;
      speeds.push(speed);
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: b.t - t0, speed });
    }
  }
  const sorted = speeds.slice().sort((a, b) => a - b);
  const speedScale = sorted.length ? Math.max(sorted[Math.floor(sorted.length * 0.9)], 1e-6) : 1;
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.08;
  return {
    segments,
    viewBox: `${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`,
    total: tEnd - t0,
    speedScale,
  };
}

/** 0 = slow (warm), 1+ = fast (ink). */
function speedColor(v: number): string {
  const k = Math.max(0, Math.min(1, v));
  return `color-mix(in oklab, var(--fast) ${Math.round(k * 100)}%, var(--slow))`;
}
