import {
  CALIBRATION,
  GROUP_NAMES,
  type DecisionModel,
  type GroupName,
  type ScoreFeature,
} from "./calibration";
import { dtwDistance, type DtwOptions } from "./dtw";
import { preprocess, type PreprocessOptions } from "./preprocess";
import type { IntraStats, MatcherStats, Template } from "./template";
import type { FeatureSequence, Signature, SignatureSummary } from "./types";

export type FactorSeverity = "ok" | "warn" | "bad";

export interface Factor {
  key: "shape" | "dynamics" | "duration" | "strokes" | "speed";
  label: string;
  detail: string;
  severity: FactorSeverity;
}

/** Distances from a query to every reference under one matcher. */
export interface MatchOutcome {
  distances: number[];
  dMin: number;
  dMean: number;
  dMax: number;
  /** min over references of distance / that reference's nearest-neighbour distance */
  local: number;
  intra: IntraStats;
}

export interface ScoreFeatures {
  values: Record<ScoreFeature, number>;
  full: MatchOutcome;
  groups: Record<GroupName, MatchOutcome>;
}

export interface VerificationResult {
  genuine: boolean;
  /** Calibrated probability that the query was written by the enrolled writer. */
  probability: number;
  threshold: number;
  /** Full-channel matcher. */
  distances: number[];
  dMin: number;
  dMean: number;
  dMax: number;
  intra: IntraStats;
  /** Shape-only and dynamics-only matchers. */
  groups: Record<GroupName, MatchOutcome>;
  scoreFeatures: Record<ScoreFeature, number>;
  /** Signed contribution of each feature to the logit; negative pushes toward "forgery". */
  contributions: Record<ScoreFeature, number>;
  query: SignatureSummary;
  reference: SignatureSummary;
  factors: Factor[];
}

export interface VerifyOptions {
  preprocess?: PreprocessOptions;
  dtw?: DtwOptions;
  model?: DecisionModel;
}

/** Compare a query signature against an enrolled template. */
export function verify(
  template: Template,
  signature: Signature,
  options: VerifyOptions = {},
): VerificationResult {
  const query = preprocess(signature, {
    ...options.preprocess,
    usePressure: template.hasPressure && signature.hasPressure,
  });
  return verifySequence(template, query, options);
}

/** Same as {@link verify}, for an already-preprocessed query. */
export function verifySequence(
  template: Template,
  query: FeatureSequence,
  options: VerifyOptions = {},
): VerificationResult {
  const model = options.model ?? CALIBRATION.model;
  const features = computeScoreFeatures(template, query, options.dtw);
  const { probability, contributions } = applyModel(model, features.values);
  const genuine = probability >= model.threshold;

  return {
    genuine,
    probability,
    threshold: model.threshold,
    distances: features.full.distances,
    dMin: features.full.dMin,
    dMean: features.full.dMean,
    dMax: features.full.dMax,
    intra: template.intra,
    groups: features.groups,
    scoreFeatures: features.values,
    contributions,
    query: query.summary,
    reference: template.referenceSummary,
    factors: explain(template, query, features),
  };
}

/**
 * Distances from the query to every reference, normalised by the writer's own
 * intra-reference spread, under the full matcher and each channel group, plus
 * two cheap scalar cues (duration and stroke count) that DTW on pen-down
 * samples cannot see directly.
 */
export function computeScoreFeatures(
  template: Template,
  query: FeatureSequence,
  dtw?: DtwOptions,
): ScoreFeatures {
  const full = match(template.references, query, template.pairwise, template.intra, dtw);
  const groups = Object.fromEntries(
    GROUP_NAMES.map((g) => {
      const stats: MatcherStats = template.groups[g];
      return [
        g,
        match(template.references, query, stats.pairwise, stats.intra, {
          ...dtw,
          channels: stats.channels,
        }),
      ];
    }),
  ) as Record<GroupName, MatchOutcome>;

  const ref = template.referenceSummary;
  const mu = full.intra.mean;
  const values: Record<ScoreFeature, number> = {
    logMin: safeLog(full.dMin / mu),
    logMean: safeLog(full.dMean / mu),
    logMax: safeLog(full.dMax / mu),
    logDuration: Math.log(
      Math.max(query.summary.penDownMs, 1) / Math.max(ref.penDownMs, 1),
    ),
    strokeDelta:
      Math.abs(query.summary.strokeCount - ref.strokeCount) /
      Math.max(1, ref.strokeCount),
    logLocal: safeLog(full.local),
    zMean: (full.dMean - mu) / Math.max(full.intra.std, 0.1 * mu),
    logSpread: safeLog(full.intra.max / mu),
    shapeLogMin: safeLog(groups.shape.dMin / groups.shape.intra.mean),
    shapeLogMean: safeLog(groups.shape.dMean / groups.shape.intra.mean),
    shapeLogLocal: safeLog(groups.shape.local),
    dynLogMin: safeLog(groups.dynamics.dMin / groups.dynamics.intra.mean),
    dynLogMean: safeLog(groups.dynamics.dMean / groups.dynamics.intra.mean),
    dynLogLocal: safeLog(groups.dynamics.local),
  };

  return { values, full, groups };
}

function match(
  references: FeatureSequence[],
  query: FeatureSequence,
  pairwise: number[][],
  intra: IntraStats,
  dtw?: DtwOptions,
): MatchOutcome {
  const distances = references.map((ref) => dtwDistance(ref, query, dtw));
  const dMin = Math.min(...distances);
  const dMax = Math.max(...distances);
  const dMean = distances.reduce((a, b) => a + b, 0) / distances.length;

  // Distance to each reference relative to that reference's own nearest
  // neighbour: a query that lands inside the cluster scores ~1 even when the
  // cluster is lopsided.
  let local = Infinity;
  pairwise.forEach((row, i) => {
    let nn = Infinity;
    row.forEach((v, j) => {
      if (j !== i && v < nn) nn = v;
    });
    const ratio = distances[i] / Math.max(nn, 1e-12);
    if (ratio < local) local = ratio;
  });

  return { distances, dMin, dMean, dMax, local, intra };
}

function safeLog(v: number): number {
  return Math.log(Math.max(v, 1e-12));
}

export function applyModel(
  model: DecisionModel,
  values: Record<ScoreFeature, number>,
): {
  probability: number;
  logit: number;
  contributions: Record<ScoreFeature, number>;
} {
  let logit = model.bias;
  const contributions = {} as Record<ScoreFeature, number>;
  model.features.forEach((name, i) => {
    const c = model.weights[i] * values[name];
    contributions[name] = c;
    logit += c;
  });
  return { probability: sigmoid(logit), logit, contributions };
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function ratioSeverity(ratio: number, warnAt: number, badAt: number): FactorSeverity {
  return ratio <= warnAt ? "ok" : ratio <= badAt ? "warn" : "bad";
}

function explain(
  template: Template,
  query: FeatureSequence,
  features: ScoreFeatures,
): Factor[] {
  const factors: Factor[] = [];

  const shape = features.groups.shape;
  const shapeRatio = shape.dMin / shape.intra.mean;
  factors.push({
    key: "shape",
    label: "Shape",
    detail: `Closest enrolled signature is ${shapeRatio.toFixed(2)}× this writer's usual spread in position and direction.`,
    severity: ratioSeverity(shapeRatio, 1.5, 2.5),
  });

  const dyn = features.groups.dynamics;
  const dynRatio = dyn.dMin / dyn.intra.mean;
  factors.push({
    key: "dynamics",
    label: "Motion",
    detail: `Velocity and speed profile is ${dynRatio.toFixed(2)}× the writer's usual spread. ${
      dynRatio > 1.8 && shapeRatio <= 1.5
        ? "The outline is right but it was not moved through the same way, which is what tracing looks like."
        : ""
    }`.trim(),
    severity: ratioSeverity(dynRatio, 1.5, 2.5),
  });

  const ref = template.referenceSummary;
  const q = query.summary;
  const durationRatio = Math.max(q.penDownMs, 1) / Math.max(ref.penDownMs, 1);
  factors.push({
    key: "duration",
    label: "Pen-down time",
    detail:
      durationRatio >= 1
        ? `Took ${durationRatio.toFixed(2)}× as long as the enrolled signatures (${(q.penDownMs / 1000).toFixed(2)} s vs ${(ref.penDownMs / 1000).toFixed(2)} s).${durationRatio > 1.5 ? " Slow, careful drawing is typical of tracing." : ""}`
        : `Took ${(1 / durationRatio).toFixed(2)}× less time than the enrolled signatures (${(q.penDownMs / 1000).toFixed(2)} s vs ${(ref.penDownMs / 1000).toFixed(2)} s).`,
    severity:
      durationRatio <= 1.35 && durationRatio >= 0.7
        ? "ok"
        : durationRatio <= 1.8 && durationRatio >= 0.5
          ? "warn"
          : "bad",
  });

  const strokeDiff = Math.abs(q.strokeCount - ref.strokeCount);
  factors.push({
    key: "strokes",
    label: "Stroke count",
    detail: `${q.strokeCount} stroke${q.strokeCount === 1 ? "" : "s"}; enrolled signatures average ${ref.strokeCount.toFixed(1)}.`,
    severity: strokeDiff < 1 ? "ok" : strokeDiff < 2 ? "warn" : "bad",
  });

  const speedRatio = ref.meanSpeed > 0 ? q.meanSpeed / ref.meanSpeed : 1;
  factors.push({
    key: "speed",
    label: "Pen speed",
    detail: `Average speed is ${speedRatio.toFixed(2)}× the enrolled signatures'.`,
    severity:
      speedRatio >= 0.75 && speedRatio <= 1.35
        ? "ok"
        : speedRatio >= 0.55 && speedRatio <= 1.8
          ? "warn"
          : "bad",
  });

  return factors;
}
