import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Downloaded corpus (git-ignored). */
export const DATA_DIR = join(here, "data");
/** Committed benchmark outputs. */
export const RESULTS_DIR = join(here, "results");
/** Engine constants written by `--calibrate`. */
export const CALIBRATION_PATH = join(
  here,
  "..",
  "src",
  "lib",
  "engine",
  "calibration.json",
);
