import { CALIBRATION } from "./calibration";
import { EngineError } from "./errors";
import type { FeatureSequence } from "./types";

export interface DtwOptions {
  /**
   * Half-width of the Sakoe-Chiba band as a fraction of the longer sequence.
   * The band follows the diagonal of the (possibly non-square) cost matrix.
   */
  bandFraction?: number;
  /**
   * How the accumulated cost is normalised: by the sum of the two lengths
   * ("sum", default) or by the number of steps on the optimal warping path
   * ("path").
   */
  normalize?: "sum" | "path";
  /** Indices of the channels to compare; all channels when omitted. */
  channels?: readonly number[];
}

/**
 * Dynamic Time Warping distance between two feature sequences.
 *
 * Local cost is the Euclidean distance between feature vectors; the global
 * cost is normalised by the sum of the two lengths so that long signatures
 * do not automatically score worse than short ones. The search is limited
 * to a band around the diagonal, which both bounds the running time and
 * prevents pathological warps (matching one sample to half a signature).
 */
export function dtwDistance(
  a: FeatureSequence,
  b: FeatureSequence,
  options: DtwOptions = {},
): number {
  if (a.dims !== b.dims) {
    throw new EngineError(
      "DIMENSION_MISMATCH",
      `Cannot compare sequences with ${a.dims} and ${b.dims} feature channels.`,
    );
  }
  const n = a.length;
  const m = b.length;
  const d = a.dims;
  if (n === 0 || m === 0) return Infinity;

  const bandFraction = options.bandFraction ?? CALIBRATION.dtw.bandFraction;
  const normalize = options.normalize ?? CALIBRATION.dtw.normalize ?? "sum";
  const ratio = m / n;
  // Wide enough that consecutive rows always overlap and (n-1, m-1) is reachable.
  const w = Math.max(
    Math.ceil(bandFraction * Math.max(n, m)),
    Math.ceil(ratio),
    1,
  );

  const A = a.data;
  const B = b.data;
  const channels = options.channels ?? Array.from({ length: d }, (_, k) => k);
  const dc = channels.length;
  let prev = new Float64Array(m).fill(Infinity);
  let curr = new Float64Array(m);
  // Number of steps on the best path into each cell (only needed for "path").
  let prevLen = new Float64Array(m);
  let currLen = new Float64Array(m);

  for (let i = 0; i < n; i++) {
    const center = i * ratio;
    const jStart = Math.max(0, Math.floor(center - w));
    const jEnd = Math.min(m - 1, Math.ceil(center + w));
    curr.fill(Infinity);
    const ai = i * d;
    for (let j = jStart; j <= jEnd; j++) {
      const bj = j * d;
      let cost = 0;
      for (let q = 0; q < dc; q++) {
        const k = channels[q];
        const diff = A[ai + k] - B[bj + k];
        cost += diff * diff;
      }
      cost = Math.sqrt(cost);

      let best: number;
      let bestLen: number;
      if (i === 0 && j === 0) {
        best = 0;
        bestLen = 0;
      } else {
        best = prev[j];
        bestLen = prevLen[j];
        if (j > 0) {
          if (curr[j - 1] < best) {
            best = curr[j - 1];
            bestLen = currLen[j - 1];
          }
          if (prev[j - 1] < best) {
            best = prev[j - 1];
            bestLen = prevLen[j - 1];
          }
        }
      }
      curr[j] = cost + best;
      currLen[j] = bestLen + 1;
    }
    let tmp = prev;
    prev = curr;
    curr = tmp;
    tmp = prevLen;
    prevLen = currLen;
    currLen = tmp;
  }

  const total = prev[m - 1];
  return normalize === "path" ? total / prevLen[m - 1] : total / (n + m);
}
