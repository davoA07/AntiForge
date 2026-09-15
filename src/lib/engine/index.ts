export * from "./types";
export { EngineError, type EngineErrorCode } from "./errors";
export {
  CALIBRATION,
  SCORE_FEATURES,
  GROUP_NAMES,
  type Calibration,
  type DecisionModel,
  type ScoreFeature,
  type GroupName,
} from "./calibration";
export {
  preprocess,
  cleanStrokes,
  resampleStroke,
  smooth,
  type PreprocessOptions,
  type ResampledStroke,
} from "./preprocess";
export { dtwDistance, type DtwOptions } from "./dtw";
export {
  buildTemplate,
  assessReferences,
  intraStats,
  meanSummary,
  MIN_REFERENCES,
  RECOMMENDED_REFERENCES,
  type Template,
  type TemplateOptions,
  type IntraStats,
  type MatcherStats,
  type ReferenceAssessment,
} from "./template";
export {
  verify,
  verifySequence,
  computeScoreFeatures,
  applyModel,
  sigmoid,
  type VerificationResult,
  type VerifyOptions,
  type Factor,
  type FactorSeverity,
  type MatchOutcome,
  type ScoreFeatures,
} from "./verify";
