/**
 * Deterministic synthetic "writers" for tests and demos.
 *
 * A writer is a pair of Fourier series (x(u), y(u)) traced over u in [0, 1]
 * with a non-uniform speed profile, split into strokes with pauses. Genuine
 * attempts perturb amplitudes, timing and position slightly; traced
 * forgeries reproduce the shape closely but move slowly and evenly, which is
 * exactly the signal the engine is meant to pick up.
 */
import type { RawPoint, RawStroke, Signature } from "./types";

export interface WriterProfile {
  ax: number[];
  bx: number[];
  ay: number[];
  by: number[];
  /** Nominal pen-down duration in ms. */
  durationMs: number;
  /** Number of strokes the signature is split into. */
  strokes: number;
  /** Pause between strokes in ms. */
  pauseMs: number;
  scale: number;
}

/** Small, fast, deterministic PRNG (mulberry32). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomWriter(rng: () => number, harmonics = 4): WriterProfile {
  const coeffs = () =>
    Array.from({ length: harmonics }, (_, k) => ((rng() * 2 - 1) * 1.2) / (k + 1));
  return {
    ax: coeffs(),
    bx: coeffs(),
    ay: coeffs(),
    by: coeffs(),
    durationMs: 1400 + rng() * 1200,
    strokes: 2 + Math.floor(rng() * 3),
    pauseMs: 120 + rng() * 200,
    scale: 120 + rng() * 80,
  };
}

interface AttemptOptions {
  /** Relative amplitude noise per coefficient. */
  shapeNoise: number;
  /** Multiplier on the nominal duration. */
  durationFactor: number;
  /** 0 = natural accelerating/decelerating profile, 1 = perfectly uniform speed. */
  uniformity: number;
  /** Positional jitter in device units per sample. */
  jitter: number;
  sampleIntervalMs: number;
  offset: { x: number; y: number };
  startTimeMs: number;
  pressure: boolean;
}

function trace(profile: WriterProfile, rng: () => number, opts: AttemptOptions): Signature {
  const perturb = (c: number[]) => c.map((v) => v * (1 + (rng() * 2 - 1) * opts.shapeNoise));
  const ax = perturb(profile.ax);
  const bx = perturb(profile.bx);
  const ay = perturb(profile.ay);
  const by = perturb(profile.by);
  const pos = (u: number) => {
    let x = 0;
    let y = 0;
    for (let k = 0; k < ax.length; k++) {
      const w = 2 * Math.PI * (k + 1) * u;
      x += ax[k] * Math.sin(w) + bx[k] * Math.cos(w);
      y += ay[k] * Math.sin(w) + by[k] * Math.cos(w);
    }
    return { x: x * profile.scale + opts.offset.x, y: y * profile.scale + opts.offset.y };
  };
  // Natural writers accelerate into a stroke and slow down at the end.
  const ease = (s: number) => (1 - opts.uniformity) * (s - Math.sin(2 * Math.PI * s) / (2 * Math.PI)) + opts.uniformity * s;

  const totalMs = profile.durationMs * opts.durationFactor;
  const strokeMs = totalMs / profile.strokes;
  const strokes: RawStroke[] = [];
  let t = opts.startTimeMs;
  for (let s = 0; s < profile.strokes; s++) {
    const u0 = s / profile.strokes;
    const u1 = (s + 1) / profile.strokes;
    const n = Math.max(2, Math.round(strokeMs / opts.sampleIntervalMs));
    const points: RawPoint[] = [];
    for (let i = 0; i < n; i++) {
      const frac = i / (n - 1);
      const u = u0 + (u1 - u0) * ease(frac);
      const p = pos(u);
      points.push({
        x: p.x + (rng() * 2 - 1) * opts.jitter,
        y: p.y + (rng() * 2 - 1) * opts.jitter,
        t: t + frac * strokeMs,
        p: opts.pressure ? 0.4 + 0.5 * Math.sin(Math.PI * frac) : undefined,
      });
    }
    strokes.push({ points });
    t += strokeMs + profile.pauseMs * (0.8 + rng() * 0.4);
  }
  return {
    strokes,
    capturedAt: 0,
    pointerType: opts.pressure ? "pen" : "mouse",
    hasPressure: opts.pressure,
  };
}

const BASE: AttemptOptions = {
  shapeNoise: 0.04,
  durationFactor: 1,
  uniformity: 0,
  jitter: 0.6,
  sampleIntervalMs: 8,
  offset: { x: 300, y: 200 },
  startTimeMs: 1000,
  pressure: false,
};

/** A natural attempt by the writer: small shape and timing variation. */
export function genuineAttempt(
  profile: WriterProfile,
  rng: () => number,
  overrides: Partial<AttemptOptions> = {},
): Signature {
  return trace(profile, rng, {
    ...BASE,
    durationFactor: 0.9 + rng() * 0.2,
    offset: { x: 200 + rng() * 200, y: 150 + rng() * 100 },
    ...overrides,
  });
}

/** Someone tracing the shape: accurate outline, slow and evenly paced. */
export function tracedForgery(
  profile: WriterProfile,
  rng: () => number,
  overrides: Partial<AttemptOptions> = {},
): Signature {
  return trace(profile, rng, {
    ...BASE,
    shapeNoise: 0.05,
    durationFactor: 2.2 + rng() * 0.6,
    uniformity: 0.9,
    jitter: 1.2,
    ...overrides,
  });
}

/** A different writer's signature presented under this identity. */
export function randomForgery(rng: () => number): Signature {
  return genuineAttempt(randomWriter(rng), rng);
}
