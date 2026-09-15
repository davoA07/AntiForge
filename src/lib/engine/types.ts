/**
 * Core data types for the AntiForge verification engine.
 *
 * The engine is framework-free: it takes raw pointer samples in, and
 * produces distances, calibrated probabilities and human-readable
 * explanations out. Nothing here touches the DOM.
 */

export type PointerKind = "mouse" | "pen" | "touch" | "unknown";

/** One pointer sample. `t` is milliseconds on any monotonic clock. */
export interface RawPoint {
  x: number;
  y: number;
  t: number;
  /** Normalised pen pressure in [0, 1] when the device reports it. */
  p?: number;
}

/** A pen-down ... pen-up segment. */
export interface RawStroke {
  points: RawPoint[];
}

/** A captured signature, exactly as the input device produced it. */
export interface Signature {
  strokes: RawStroke[];
  /** Unix epoch milliseconds. */
  capturedAt: number;
  pointerType: PointerKind;
  /** True when `p` carries real pressure readings rather than a constant. */
  hasPressure: boolean;
  /** Capture surface size in CSS pixels; informational only. */
  surface?: { width: number; height: number };
}

/** Per-sample feature channels, in storage order. */
export const FEATURE_NAMES = [
  "x",
  "y",
  "vx",
  "vy",
  "speed",
  "dirX",
  "dirY",
  "pressure",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Scalar descriptors of one signature, used for explanations and gating. */
export interface SignatureSummary {
  strokeCount: number;
  sampleCount: number;
  /** First sample to last sample, including pen-up pauses. */
  durationMs: number;
  /** Time the pen spent on the surface. */
  penDownMs: number;
  /** Time the pen spent lifted between strokes. */
  pauseMs: number;
  /** Total pen-down path length, in size-normalised units. */
  pathLength: number;
  /** Mean pen-down speed, in size-normalised units per second. */
  meanSpeed: number;
  /** Raw bounding box of the capture, in device units. */
  extent: { width: number; height: number };
}

/**
 * A signature after preprocessing: uniformly resampled in time, centred,
 * size-normalised and expanded into per-sample feature vectors.
 *
 * `data` is row-major: sample `i`, channel `k` lives at `data[i * dims + k]`.
 */
export interface FeatureSequence {
  length: number;
  dims: number;
  features: FeatureName[];
  data: Float64Array;
  summary: SignatureSummary;
}
