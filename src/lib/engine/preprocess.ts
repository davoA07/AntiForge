import { CALIBRATION } from "./calibration";
import { EngineError } from "./errors";
import {
  FEATURE_NAMES,
  type FeatureName,
  type FeatureSequence,
  type RawPoint,
  type RawStroke,
  type Signature,
  type SignatureSummary,
} from "./types";

export interface PreprocessOptions {
  /** Target spacing between resampled points. Defaults to the calibrated value. */
  sampleIntervalMs?: number;
  /** Include the pressure channel. Defaults to `signature.hasPressure`. */
  usePressure?: boolean;
  /** Upper bound on resampled points; longer captures are thinned uniformly. */
  maxSamples?: number;
  /** Per-channel multipliers; defaults to the calibrated scale. */
  featureScale?: Partial<Record<FeatureName, number>>;
  /** Odd moving-average window applied to positions before differentiation; 1 disables. */
  smoothingWindow?: number;
}

export interface ResampledStroke {
  x: Float64Array;
  y: Float64Array;
  p: Float64Array;
  /** Timestamp of the first resampled point. */
  t0: number;
  /** Spacing between resampled points, in ms. */
  dt: number;
  n: number;
}

const DEFAULT_MAX_SAMPLES = 3000;

/**
 * Turn a raw signature into a feature sequence suitable for DTW.
 *
 * Steps:
 *  1. Drop unusable strokes (fewer than two finite samples).
 *  2. Resample every stroke on a uniform time grid (default 100 Hz). Pauses
 *     between strokes are not filled in; they are kept as summary statistics.
 *  3. Centre on the sample centroid and divide by the RMS radius so that the
 *     result is invariant to where and how large the signature was drawn.
 *  4. Derive velocity, speed and direction per sample with central
 *     differences, and normalise pressure by its per-signature maximum.
 *  5. Multiply each channel by its calibrated scale so that channels are
 *     commensurate inside the DTW local distance.
 */
export function preprocess(
  signature: Signature,
  options: PreprocessOptions = {},
): FeatureSequence {
  const baseInterval = options.sampleIntervalMs ?? CALIBRATION.sampleIntervalMs;
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const usePressure = options.usePressure ?? signature.hasPressure;

  const strokes = cleanStrokes(signature.strokes);
  if (strokes.length === 0) {
    throw new EngineError(
      "EMPTY_SIGNATURE",
      "The signature has no stroke with at least two samples.",
    );
  }

  let interval = baseInterval;
  let resampled = strokes.map((s) => resampleStroke(s, interval));
  let total = resampled.reduce((acc, s) => acc + s.n, 0);
  if (total > maxSamples) {
    interval = (interval * total) / maxSamples;
    resampled = strokes.map((s) => resampleStroke(s, interval));
    total = resampled.reduce((acc, s) => acc + s.n, 0);
  }

  const window = options.smoothingWindow ?? CALIBRATION.smoothingWindow;
  if (window > 1) {
    for (const s of resampled) {
      s.x = smooth(s.x, window);
      s.y = smooth(s.y, window);
      s.p = smooth(s.p, window);
    }
  }

  // Centroid and RMS radius over all pen-down samples.
  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxP = 0;
  for (const s of resampled) {
    for (let k = 0; k < s.n; k++) {
      const x = s.x[k];
      const y = s.y[k];
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (s.p[k] > maxP) maxP = s.p[k];
    }
  }
  const meanX = sumX / total;
  const meanY = sumY / total;
  let sumSq = 0;
  for (const s of resampled) {
    for (let k = 0; k < s.n; k++) {
      const dx = s.x[k] - meanX;
      const dy = s.y[k] - meanY;
      sumSq += dx * dx + dy * dy;
    }
  }
  const rms = Math.sqrt(sumSq / total);
  if (!(rms > 1e-9)) {
    throw new EngineError(
      "DEGENERATE_SIGNATURE",
      "Every sample sits at the same position; there is nothing to compare.",
    );
  }

  const features: FeatureName[] = usePressure
    ? [...FEATURE_NAMES]
    : FEATURE_NAMES.filter((name) => name !== "pressure");
  const dims = features.length;
  const scale = features.map(
    (name) => options.featureScale?.[name] ?? CALIBRATION.featureScale[name],
  );
  const pressureIndex = features.indexOf("pressure");

  const data = new Float64Array(total * dims);
  let row = 0;
  let pathLength = 0;
  let penDownMs = 0;

  for (const s of resampled) {
    const dtSec = s.dt / 1000;
    penDownMs += s.dt * (s.n - 1);
    for (let k = 0; k < s.n; k++) {
      const nx = (s.x[k] - meanX) / rms;
      const ny = (s.y[k] - meanY) / rms;

      const k0 = k > 0 ? k - 1 : k;
      const k1 = k < s.n - 1 ? k + 1 : k;
      const span = (k1 - k0) * dtSec;
      const vx = span > 0 ? (s.x[k1] - s.x[k0]) / rms / span : 0;
      const vy = span > 0 ? (s.y[k1] - s.y[k0]) / rms / span : 0;
      const speed = Math.hypot(vx, vy);
      const dirX = speed > 1e-9 ? vx / speed : 0;
      const dirY = speed > 1e-9 ? vy / speed : 0;

      if (k > 0) {
        pathLength += Math.hypot(
          (s.x[k] - s.x[k - 1]) / rms,
          (s.y[k] - s.y[k - 1]) / rms,
        );
      }

      const base = row * dims;
      data[base] = nx * scale[0];
      data[base + 1] = ny * scale[1];
      data[base + 2] = vx * scale[2];
      data[base + 3] = vy * scale[3];
      data[base + 4] = speed * scale[4];
      data[base + 5] = dirX * scale[5];
      data[base + 6] = dirY * scale[6];
      if (pressureIndex >= 0) {
        data[base + pressureIndex] =
          (maxP > 0 ? s.p[k] / maxP : 0) * scale[pressureIndex];
      }
      row++;
    }
  }

  const first = resampled[0];
  const last = resampled[resampled.length - 1];
  const durationMs = Math.max(0, last.t0 + last.dt * (last.n - 1) - first.t0);
  const pauseMs = Math.max(0, durationMs - penDownMs);

  const summary: SignatureSummary = {
    strokeCount: resampled.length,
    sampleCount: total,
    durationMs,
    penDownMs,
    pauseMs,
    pathLength,
    meanSpeed: penDownMs > 0 ? pathLength / (penDownMs / 1000) : 0,
    extent: { width: maxX - minX, height: maxY - minY },
  };

  return { length: total, dims, features, data, summary };
}

/** Keep strokes with at least two finite samples, ordered by time. */
export function cleanStrokes(strokes: RawStroke[]): RawStroke[] {
  const cleaned: RawStroke[] = [];
  for (const stroke of strokes) {
    const points = stroke.points
      .filter(
        (pt) =>
          Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.t),
      )
      .slice()
      .sort((a, b) => a.t - b.t);
    if (points.length >= 2) cleaned.push({ points });
  }
  return cleaned;
}

/**
 * Resample one stroke on a uniform grid spanning its first and last sample.
 * The grid spacing is the stroke duration divided into round(duration /
 * interval) steps, so it is within half an interval of the requested value
 * and both endpoints are preserved exactly.
 */
export function resampleStroke(
  stroke: RawStroke,
  intervalMs: number,
): ResampledStroke {
  const pts = stroke.points;
  const t0 = pts[0].t;
  const spanMs = pts[pts.length - 1].t - t0;
  const steps = spanMs > 0 ? Math.max(1, Math.round(spanMs / intervalMs)) : 1;
  const dt = spanMs > 0 ? spanMs / steps : intervalMs;
  const n = steps + 1;

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const p = new Float64Array(n);

  let i = 0;
  for (let k = 0; k < n; k++) {
    const tk = spanMs > 0 ? t0 + k * dt : k === 0 ? t0 : pts[pts.length - 1].t;
    while (i < pts.length - 2 && pts[i + 1].t <= tk) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const segment = b.t - a.t;
    const alpha = segment > 0 ? clamp((tk - a.t) / segment, 0, 1) : 1;
    x[k] = lerp(a.x, b.x, alpha);
    y[k] = lerp(a.y, b.y, alpha);
    p[k] = lerp(pressureOf(a), pressureOf(b), alpha);
  }

  return { x, y, p, t0, dt, n };
}

/** Centred moving average; the window shrinks near the ends so endpoints stay put. */
export function smooth(values: Float64Array, window: number): Float64Array {
  const half = Math.floor(window / 2);
  const n = values.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const reach = Math.min(half, i, n - 1 - i);
    let sum = 0;
    for (let k = i - reach; k <= i + reach; k++) sum += values[k];
    out[i] = sum / (2 * reach + 1);
  }
  return out;
}

function pressureOf(pt: RawPoint): number {
  return typeof pt.p === "number" && Number.isFinite(pt.p) ? pt.p : 0;
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
