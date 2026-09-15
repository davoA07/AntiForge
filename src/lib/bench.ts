import summary from "../../bench/results/summary.json";

export interface RateSummary {
  eer: number;
  auc: number;
  far: number;
  frr: number;
}

export interface TaskSummary {
  name: string;
  trials: { genuine: number; skilled: number; random: number };
  skilled: RateSummary;
  random: RateSummary;
  userDependentEer: number;
  roc: { skilled: [number, number][]; random: [number, number][] };
}

export interface BenchSummary {
  generatedAt: string;
  dataset: string;
  protocol: {
    users: number;
    references: number;
    genuinePerUser: number;
    skilledPerUser: number;
    randomPerUser: number;
    sampleIntervalMs: number;
    bandFraction: number;
  };
  tasks: { task1: TaskSummary; task2: TaskSummary };
  crossFit: {
    fitTask1_evalTask2: { skilledEer: number; randomEer: number; userDependentEer: number };
    fitTask2_evalTask1: { skilledEer: number; randomEer: number; userDependentEer: number };
  };
}

/** Numbers produced by `pnpm bench`; the landing page and README quote these. */
export const BENCH: BenchSummary = summary as unknown as BenchSummary;
