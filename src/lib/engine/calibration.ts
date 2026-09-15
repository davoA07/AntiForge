import calibration from "./calibration.json";
import type { FeatureName } from "./types";

/** Scalar inputs to the decision model, derived from DTW distances. */
export const SCORE_FEATURES = [
  /** ln(min distance to a reference / mean intra-reference distance) */
  "logMin",
  /** ln(mean distance to the references / mean intra-reference distance) */
  "logMean",
  /** ln(max distance to a reference / mean intra-reference distance) */
  "logMax",
  /** ln(query pen-down time / mean reference pen-down time) */
  "logDuration",
  /** |stroke count difference| / reference stroke count */
  "strokeDelta",
  /** ln(min over references of distance / that reference's nearest-neighbour distance) */
  "logLocal",
  /** (mean distance - intra mean) / intra std */
  "zMean",
  /** ln(intra max / intra mean): how uneven the writer's own references are */
  "logSpread",
  /** Same three normalised distances, from a DTW over the shape channels only */
  "shapeLogMin",
  "shapeLogMean",
  "shapeLogLocal",
  /** ... and over the dynamics channels only */
  "dynLogMin",
  "dynLogMean",
  "dynLogLocal",
] as const;

export type ScoreFeature = (typeof SCORE_FEATURES)[number];

/** Channel subsets matched separately so the model can tell "right shape, wrong motion" apart. */
export const GROUP_NAMES = ["shape", "dynamics"] as const;
export type GroupName = (typeof GROUP_NAMES)[number];

export interface DecisionModel {
  features: ScoreFeature[];
  weights: number[];
  bias: number;
  /** Accept when the calibrated probability of being genuine reaches this. */
  threshold: number;
}

export interface Calibration {
  version: number;
  sampleIntervalMs: number;
  /** Odd window (in samples) of the moving average applied before differentiation; 1 = off. */
  smoothingWindow: number;
  dtw: { bandFraction: number; normalize?: "sum" | "path" };
  groups: Record<GroupName, FeatureName[]>;
  /** Multiplier applied to each feature channel before DTW. */
  featureScale: Record<FeatureName, number>;
  model: DecisionModel;
  provenance: Record<string, unknown>;
}

/**
 * Constants fitted by `bench/run.ts --calibrate` against SVC2004.
 * Do not hand-edit `calibration.json`; re-run the benchmark instead.
 */
export const CALIBRATION: Calibration = calibration as Calibration;
