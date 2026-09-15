/**
 * SVC2004 benchmark for the AntiForge engine.
 *
 *   pnpm bench              evaluate the shipped calibration, write results
 *   pnpm bench:calibrate    additionally refit feature scales + decision model
 *                           and write src/lib/engine/calibration.json
 *
 * Protocol (per task, per writer):
 *   enroll     samples 1-5      (genuine)
 *   genuine    samples 6-20     (15 trials)
 *   skilled    samples 21-40    (20 trials, forgers who practised the signature)
 *   random     sample 6 of every other writer (39 trials)
 *
 * Numbers are reported for a single writer-independent threshold ("global
 * EER") and, for comparison with the literature, as the mean of per-writer
 * EERs ("user-dependent EER"). The model is cross-fitted across tasks so the
 * held-out figures come from writers the fit never saw.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CALIBRATION, SCORE_FEATURES, type DecisionModel } from "../src/lib/engine/calibration";
import { preprocess } from "../src/lib/engine/preprocess";
import { buildTemplate } from "../src/lib/engine/template";
import { FEATURE_NAMES, type FeatureName } from "../src/lib/engine/types";
import { applyModel, computeScoreFeatures } from "../src/lib/engine/verify";
import { fitLogistic } from "./logistic";
import { errorRates, ratesAt, type RocPoint } from "./metrics";
import { CALIBRATION_PATH, DATA_DIR, RESULTS_DIR } from "./paths";
import { renderRocSvg, type RocSeries } from "./roc-svg";
import { loadTask, type Svc2004Sample, type Task } from "./svc2004";

type TrialKind = "genuine" | "skilled" | "random";

interface Trial {
  task: Task;
  user: number;
  kind: TrialKind;
  values: number[];
}

type ScoreFeatureName = (typeof SCORE_FEATURES)[number];

interface Args {
  /** Write the fitted constants to calibration.json. */
  calibrate: boolean;
  /** Refit feature scales and the decision model (implied by --calibrate). */
  fit: boolean;
  references: number;
  bandFraction: number;
  /** Feature channels to zero out (experiments). */
  drop: FeatureName[];
  /** Extra per-channel multipliers on top of the fitted 1/std scale. */
  weight: Partial<Record<FeatureName, number>>;
  /** DTW cost normalisation. */
  normalize: "sum" | "path";
  /** Moving-average window before differentiation. */
  smooth: number;
  /** L2 penalty for the logistic fit. */
  lambda: number;
  /** Subset of score features the decision model may use. */
  features: ScoreFeatureName[];
}

const REFERENCE_COUNT = 5;
const FIRST_TEST_GENUINE = 6;
const RANDOM_SAMPLE = 6;

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (flag: string) =>
    (get(flag) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const calibrate = argv.includes("--calibrate");
  const drop = list("--drop") as FeatureName[];
  for (const name of drop) {
    if (!FEATURE_NAMES.includes(name)) throw new Error(`Unknown channel: ${name}`);
  }
  const features = (list("--features") as ScoreFeatureName[]).filter((f) =>
    SCORE_FEATURES.includes(f),
  );
  const weight: Partial<Record<FeatureName, number>> = {};
  for (const pair of list("--weight")) {
    const [name, value] = pair.split("=");
    if (!FEATURE_NAMES.includes(name as FeatureName)) throw new Error(`Unknown channel: ${name}`);
    weight[name as FeatureName] = Number(value);
  }
  const normalize = (get("--norm") ?? CALIBRATION.dtw.normalize ?? "sum") as "sum" | "path";
  return {
    calibrate,
    fit: calibrate || argv.includes("--fit"),
    references: Number(get("--refs") ?? REFERENCE_COUNT),
    bandFraction: Number(get("--band") ?? CALIBRATION.dtw.bandFraction),
    drop,
    weight,
    normalize,
    smooth: Number(get("--smooth") ?? CALIBRATION.smoothingWindow),
    lambda: Number(get("--lambda") ?? 1),
    features: features.length ? features : [...SCORE_FEATURES],
  };
}

function ensureData(): void {
  if (!existsSync(join(DATA_DIR, "Task1", "U1S1.TXT"))) {
    console.error("SVC2004 not found. Run `pnpm bench:fetch` first.");
    process.exit(1);
  }
}

/** Per-channel 1/std over every genuine sample, with unit scales. */
function fitFeatureScale(
  tasks: Map<Task, Map<number, Svc2004Sample[]>>,
  sampleIntervalMs: number,
  smoothingWindow: number,
): Record<FeatureName, number> {
  const unit = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 1])) as Record<
    FeatureName,
    number
  >;
  const sum = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<
    FeatureName,
    number
  >;
  const sumSq = { ...sum };
  const count = { ...sum };

  for (const [task, users] of tasks) {
    for (const samples of users.values()) {
      for (const s of samples) {
        if (!s.genuine) continue;
        const seq = preprocess(s.signature, {
          sampleIntervalMs,
          featureScale: unit,
          usePressure: task === 2,
          smoothingWindow,
        });
        for (let i = 0; i < seq.length; i++) {
          seq.features.forEach((name, k) => {
            const v = seq.data[i * seq.dims + k];
            sum[name] += v;
            sumSq[name] += v * v;
            count[name] += 1;
          });
        }
      }
    }
  }

  const scale = { ...unit };
  for (const name of FEATURE_NAMES) {
    const n = count[name];
    if (n === 0) continue;
    const mean = sum[name] / n;
    const variance = Math.max(sumSq[name] / n - mean * mean, 1e-12);
    scale[name] = round(1 / Math.sqrt(variance), 4);
  }
  return scale;
}

function runTrials(
  task: Task,
  users: Map<number, Svc2004Sample[]>,
  featureScale: Record<FeatureName, number>,
  args: Args,
  sampleIntervalMs: number,
): Trial[] {
  const trials: Trial[] = [];
  const pre = {
    sampleIntervalMs,
    featureScale,
    usePressure: task === 2,
    smoothingWindow: args.smooth,
  };
  const dtw = { bandFraction: args.bandFraction, normalize: args.normalize };
  const userIds = [...users.keys()].sort((a, b) => a - b);

  for (const user of userIds) {
    const samples = users.get(user)!;
    const bySample = new Map(samples.map((s) => [s.sample, s]));
    const refs = [];
    for (let i = 1; i <= args.references; i++) refs.push(bySample.get(i)!.signature);
    const template = buildTemplate(refs, { preprocess: pre, dtw });

    const record = (kind: TrialKind, sample: Svc2004Sample) => {
      const seq = preprocess(sample.signature, pre);
      const { values } = computeScoreFeatures(template, seq, dtw);
      trials.push({ task, user, kind, values: SCORE_FEATURES.map((f) => values[f]) });
    };

    for (const s of samples) {
      if (s.genuine && s.sample >= FIRST_TEST_GENUINE) record("genuine", s);
      else if (!s.genuine) record("skilled", s);
    }
    for (const other of userIds) {
      if (other === user) continue;
      record("random", users.get(other)!.find((s) => s.sample === RANDOM_SAMPLE)!);
    }
    if (process.stdout.isTTY) {
      process.stdout.write(`\rTask ${task}: writer ${user}/${userIds.length}   `);
    }
  }
  if (process.stdout.isTTY) process.stdout.write("\n");
  return trials;
}

function fitModel(
  trials: Trial[],
  features: ScoreFeatureName[],
  threshold: number | null,
  lambda: number,
): DecisionModel {
  const columns = features.map((f) => SCORE_FEATURES.indexOf(f));
  const rows = trials.filter((t) => t.kind !== "random");
  const fit = fitLogistic(
    rows.map((t) => columns.map((c) => t.values[c])),
    rows.map((t) => (t.kind === "genuine" ? 1 : 0)),
    { lambda },
  );
  const model: DecisionModel = {
    features: [...features],
    weights: fit.weights.map((w) => round(w, 4)),
    bias: round(fit.bias, 4),
    threshold: threshold ?? 0.5,
  };
  if (threshold === null) {
    // Operate at the equal-error point of the fitting set.
    const { genuine, skilled } = scoreTrials(trials, model);
    model.threshold = round(errorRates(genuine, skilled).eerThreshold, 4);
  }
  return model;
}

function scoreTrials(trials: Trial[], model: DecisionModel) {
  const out = { genuine: [] as number[], skilled: [] as number[], random: [] as number[] };
  for (const t of trials) {
    const values = Object.fromEntries(
      SCORE_FEATURES.map((f, i) => [f, t.values[i]]),
    ) as Record<(typeof SCORE_FEATURES)[number], number>;
    out[t.kind].push(applyModel(model, values).probability);
  }
  return out;
}

function evaluate(trials: Trial[], model: DecisionModel) {
  const scores = scoreTrials(trials, model);
  const skilled = errorRates(scores.genuine, scores.skilled);
  const random = errorRates(scores.genuine, scores.random);
  const skilledAt = ratesAt(scores.genuine, scores.skilled, model.threshold);
  const randomAt = ratesAt(scores.genuine, scores.random, model.threshold);

  // Mean of per-writer EERs (each writer gets its own ideal threshold).
  const users = [...new Set(trials.map((t) => t.user))];
  const perUser = users.map((user) => {
    const own = trials.filter((t) => t.user === user);
    const s = scoreTrials(own, model);
    return errorRates(s.genuine, s.skilled).eer;
  });
  const userDependentEer = perUser.reduce((a, b) => a + b, 0) / perUser.length;

  return {
    trials: {
      genuine: scores.genuine.length,
      skilled: scores.skilled.length,
      random: scores.random.length,
    },
    skilled: { eer: skilled.eer, auc: skilled.auc, far: skilledAt.far, frr: skilledAt.frr },
    random: { eer: random.eer, auc: random.auc, far: randomAt.far, frr: randomAt.frr },
    userDependentEer,
    roc: { skilled: thinRoc(skilled.roc), random: thinRoc(random.roc) },
  };
}

/** Keep the ROC small enough to commit: at most ~120 [FAR, TAR] points. */
function thinRoc(roc: RocPoint[]): [number, number][] {
  const pts = roc.map((p) => [p.far, 1 - p.frr] as [number, number]).reverse();
  const step = Math.max(1, Math.floor(pts.length / 120));
  const thinned = pts.filter((_, i) => i % step === 0);
  if (thinned[thinned.length - 1] !== pts[pts.length - 1]) thinned.push(pts[pts.length - 1]);
  return thinned.map(([a, b]) => [round(a, 4), round(b, 4)]);
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function main() {
  const args = parseArgs();
  ensureData();
  const sampleIntervalMs = CALIBRATION.sampleIntervalMs;

  console.log("Loading SVC2004 ...");
  const tasks = new Map<Task, Map<number, Svc2004Sample[]>>([
    [1, loadTask(DATA_DIR, 1)],
    [2, loadTask(DATA_DIR, 2)],
  ]);

  const featureScale = args.fit
    ? fitFeatureScale(tasks, sampleIntervalMs, args.smooth)
    : { ...CALIBRATION.featureScale };
  for (const name of args.drop) featureScale[name] = 0;
  for (const [name, factor] of Object.entries(args.weight)) {
    featureScale[name as FeatureName] = round(featureScale[name as FeatureName] * factor, 4);
  }
  if (args.fit) console.log("Feature scale:", featureScale);

  const trials = new Map<Task, Trial[]>();
  for (const [task, users] of tasks) {
    trials.set(task, runTrials(task, users, featureScale, args, sampleIntervalMs));
  }
  const t1 = trials.get(1)!;
  const t2 = trials.get(2)!;

  // Cross-fitted generalisation estimates: fit on one task's writers, score the other's.
  const fit1 = fitModel(t1, args.features, null, args.lambda);
  const fit2 = fitModel(t2, args.features, null, args.lambda);
  const cross = {
    fitTask1_evalTask2: evaluate(t2, fit1),
    fitTask2_evalTask1: evaluate(t1, fit2),
  };

  const model = args.fit
    ? fitModel([...t1, ...t2], args.features, null, args.lambda)
    : CALIBRATION.model;
  const results = {
    task1: evaluate(t1, model),
    task2: evaluate(t2, model),
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    dataset: "SVC2004",
    protocol: {
      users: 40,
      references: args.references,
      genuinePerUser: 15,
      skilledPerUser: 20,
      randomPerUser: 39,
      sampleIntervalMs,
      smoothingWindow: args.smooth,
      bandFraction: args.bandFraction,
      normalize: args.normalize,
      lambda: args.lambda,
    },
    featureScale,
    model,
    tasks: {
      task1: { name: "Task 1 (x, y, time)", ...results.task1 },
      task2: { name: "Task 2 (x, y, time, pressure)", ...results.task2 },
    },
    crossFit: {
      fitTask1_evalTask2: {
        skilledEer: cross.fitTask1_evalTask2.skilled.eer,
        randomEer: cross.fitTask1_evalTask2.random.eer,
        userDependentEer: cross.fitTask1_evalTask2.userDependentEer,
      },
      fitTask2_evalTask1: {
        skilledEer: cross.fitTask2_evalTask1.skilled.eer,
        randomEer: cross.fitTask2_evalTask1.random.eer,
        userDependentEer: cross.fitTask2_evalTask1.userDependentEer,
      },
    },
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  const series: RocSeries[] = [
    { label: `Task 2 skilled forgeries (EER ${pct(results.task2.skilled.eer)})`, color: "#1f6f8b", points: results.task2.roc.skilled },
    { label: `Task 1 skilled forgeries (EER ${pct(results.task1.skilled.eer)})`, color: "#c8502b", points: results.task1.roc.skilled },
    { label: `Task 2 random forgeries (EER ${pct(results.task2.random.eer)})`, color: "#1f6f8b", dashed: true, points: results.task2.roc.random },
    { label: `Task 1 random forgeries (EER ${pct(results.task1.random.eer)})`, color: "#c8502b", dashed: true, points: results.task1.roc.random },
  ];
  writeFileSync(
    join(RESULTS_DIR, "roc.svg"),
    renderRocSvg(series, "AntiForge on SVC2004 — 5 reference signatures, global threshold"),
  );

  if (args.calibrate) {
    const calibration = {
      version: 1,
      sampleIntervalMs,
      smoothingWindow: args.smooth,
      dtw: { bandFraction: args.bandFraction, normalize: args.normalize },
      groups: CALIBRATION.groups,
      featureScale,
      model,
      provenance: {
        status: "calibrated",
        dataset: "SVC2004 Task 1 + Task 2 (40 writers each)",
        protocol: "5 references, 15 genuine + 20 skilled + 39 random trials per writer",
        generatedAt: summary.generatedAt,
        heldOut: summary.crossFit,
      },
    };
    writeFileSync(CALIBRATION_PATH, JSON.stringify(calibration, null, 2) + "\n");
    console.log(`Wrote ${CALIBRATION_PATH}`);
  }

  console.log("");
  console.log("Model:", JSON.stringify(model));
  console.log("");
  console.log("                          skilled EER   random EER   AUC(skilled)   FAR/FRR @ threshold   user-dep EER");
  for (const [name, r] of Object.entries(results)) {
    console.log(
      `${name.padEnd(24)}  ${pct(r.skilled.eer).padStart(11)}   ${pct(r.random.eer).padStart(10)}   ${r.skilled.auc.toFixed(4).padStart(12)}   ${pct(r.skilled.far)} / ${pct(r.skilled.frr)}   ${pct(r.userDependentEer).padStart(12)}`,
    );
  }
  console.log("");
  console.log("Held-out (fit on other task):");
  console.log(`  fit Task1 -> eval Task2   skilled EER ${pct(cross.fitTask1_evalTask2.skilled.eer)}   random EER ${pct(cross.fitTask1_evalTask2.random.eer)}`);
  console.log(`  fit Task2 -> eval Task1   skilled EER ${pct(cross.fitTask2_evalTask1.skilled.eer)}   random EER ${pct(cross.fitTask2_evalTask1.random.eer)}`);
  console.log("");
  console.log(`Wrote ${join(RESULTS_DIR, "summary.json")} and roc.svg`);
}

main();
