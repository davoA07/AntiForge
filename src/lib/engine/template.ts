import { CALIBRATION, GROUP_NAMES, type GroupName } from "./calibration";
import { dtwDistance, type DtwOptions } from "./dtw";
import { EngineError } from "./errors";
import { preprocess, type PreprocessOptions } from "./preprocess";
import type { FeatureName, FeatureSequence, Signature, SignatureSummary } from "./types";

export const MIN_REFERENCES = 3;
export const RECOMMENDED_REFERENCES = 5;

/** Floor for the intra-writer spread so that identical references cannot divide by zero. */
const INTRA_EPSILON = 1e-6;

export interface IntraStats {
  mean: number;
  std: number;
  min: number;
  max: number;
}

/** Pairwise structure of the references under one DTW matcher. */
export interface MatcherStats {
  /** Channel indices this matcher compares. */
  channels: number[];
  /** Symmetric matrix of DTW distances between references. */
  pairwise: number[][];
  intra: IntraStats;
}

/**
 * Everything the verifier needs about one enrolled writer: the preprocessed
 * reference signatures, how far apart they are from each other (under the
 * full matcher and under each channel group), and a summary of their scalar
 * characteristics.
 */
export interface Template {
  version: 2;
  createdAt: number;
  hasPressure: boolean;
  references: FeatureSequence[];
  /** Full-channel matcher: symmetric matrix of DTW distances between references. */
  pairwise: number[][];
  intra: IntraStats;
  /** Per-group matchers (shape only, dynamics only). */
  groups: Record<GroupName, MatcherStats>;
  /** Mean of the reference summaries. */
  referenceSummary: SignatureSummary;
}

export interface TemplateOptions {
  preprocess?: PreprocessOptions;
  dtw?: DtwOptions;
  /** Channel groups; defaults to the calibrated ones. */
  groups?: Record<GroupName, FeatureName[]>;
}

export function buildTemplate(
  signatures: Signature[],
  options: TemplateOptions = {},
): Template {
  if (signatures.length < MIN_REFERENCES) {
    throw new EngineError(
      "TOO_FEW_REFERENCES",
      `Enrollment needs at least ${MIN_REFERENCES} signatures; got ${signatures.length}.`,
    );
  }

  // Pressure is only usable when every reference has it.
  const hasPressure =
    options.preprocess?.usePressure ?? signatures.every((s) => s.hasPressure);

  const references = signatures.map((s) =>
    preprocess(s, { ...options.preprocess, usePressure: hasPressure }),
  );

  const groupDefs = options.groups ?? CALIBRATION.groups;
  const featureIndex = (name: FeatureName) => references[0].features.indexOf(name);
  const groupChannels = Object.fromEntries(
    GROUP_NAMES.map((g) => [
      g,
      groupDefs[g].map(featureIndex).filter((i) => i >= 0),
    ]),
  ) as Record<GroupName, number[]>;

  const full = pairwiseDistances(references, options.dtw);
  const groups = Object.fromEntries(
    GROUP_NAMES.map((g) => {
      const channels = groupChannels[g];
      const stats = pairwiseDistances(references, { ...options.dtw, channels });
      return [g, { channels, pairwise: stats.pairwise, intra: stats.intra }];
    }),
  ) as Record<GroupName, MatcherStats>;

  return {
    version: 2,
    createdAt: Date.now(),
    hasPressure,
    references,
    pairwise: full.pairwise,
    intra: full.intra,
    groups,
    referenceSummary: meanSummary(references.map((r) => r.summary)),
  };
}

function pairwiseDistances(
  references: FeatureSequence[],
  dtw?: DtwOptions,
): { pairwise: number[][]; intra: IntraStats } {
  const n = references.length;
  const pairwise: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  const distances: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = dtwDistance(references[i], references[j], dtw);
      pairwise[i][j] = dist;
      pairwise[j][i] = dist;
      distances.push(dist);
    }
  }
  return { pairwise, intra: intraStats(distances) };
}

export interface ReferenceAssessment {
  perReference: { index: number; meanDistance: number; outlier: boolean }[];
  /** True when no reference is an outlier. */
  consistent: boolean;
}

/**
 * Flag references that sit unusually far from the rest of the set. A single
 * bad enrollment sample (a slip, a distracted attempt) inflates the writer's
 * apparent variability and makes forgeries easier to pass, so the UI asks
 * the user to redo it.
 */
export function assessReferences(
  template: Template,
  outlierRatio = 1.8,
): ReferenceAssessment {
  const n = template.references.length;
  const means = template.pairwise.map((row, i) => {
    let sum = 0;
    for (let j = 0; j < n; j++) if (j !== i) sum += row[j];
    return sum / Math.max(1, n - 1);
  });
  const sorted = means.slice().sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const perReference = means.map((meanDistance, index) => ({
    index,
    meanDistance,
    outlier: median > 0 && meanDistance > outlierRatio * median,
  }));

  return {
    perReference,
    consistent: perReference.every((r) => !r.outlier),
  };
}

export function intraStats(distances: number[]): IntraStats {
  if (distances.length === 0) {
    return { mean: INTRA_EPSILON, std: 0, min: 0, max: 0 };
  }
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance =
    distances.reduce((acc, d) => acc + (d - mean) * (d - mean), 0) /
    distances.length;
  return {
    mean: Math.max(mean, INTRA_EPSILON),
    std: Math.sqrt(variance),
    min: Math.min(...distances),
    max: Math.max(...distances),
  };
}

export function meanSummary(summaries: SignatureSummary[]): SignatureSummary {
  const n = Math.max(1, summaries.length);
  const avg = (pick: (s: SignatureSummary) => number) =>
    summaries.reduce((acc, s) => acc + pick(s), 0) / n;
  return {
    strokeCount: avg((s) => s.strokeCount),
    sampleCount: avg((s) => s.sampleCount),
    durationMs: avg((s) => s.durationMs),
    penDownMs: avg((s) => s.penDownMs),
    pauseMs: avg((s) => s.pauseMs),
    pathLength: avg((s) => s.pathLength),
    meanSpeed: avg((s) => s.meanSpeed),
    extent: {
      width: avg((s) => s.extent.width),
      height: avg((s) => s.extent.height),
    },
  };
}
