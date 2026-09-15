import { describe, expect, it } from "vitest";
import { dtwDistance } from "./dtw";
import { EngineError } from "./errors";
import type { FeatureSequence } from "./types";

function seq(values: number[][]): FeatureSequence {
  const dims = values[0]?.length ?? 1;
  const data = new Float64Array(values.length * dims);
  values.forEach((row, i) => row.forEach((v, k) => (data[i * dims + k] = v)));
  return {
    length: values.length,
    dims,
    features: [],
    data,
    summary: {
      strokeCount: 1,
      sampleCount: values.length,
      durationMs: 0,
      penDownMs: 0,
      pauseMs: 0,
      pathLength: 0,
      meanSpeed: 0,
      extent: { width: 0, height: 0 },
    },
  };
}

describe("dtwDistance", () => {
  it("is zero for identical sequences", () => {
    const a = seq([[0], [1], [2], [3]]);
    expect(dtwDistance(a, a)).toBe(0);
  });

  it("is zero when one sequence is a time-stretched copy of the other", () => {
    const a = seq([[1], [2], [3]]);
    const b = seq([[1], [2], [2], [3]]);
    expect(dtwDistance(a, b, { bandFraction: 1 })).toBe(0);
  });

  it("matches the textbook value on a small example", () => {
    // Full-window DTW between [1,3,4,9,8,2,1,5,7,3] and [1,6,2,3,0,9,4,3,6,3]
    // has cumulative cost 15 (classic example); normalised by n + m = 20.
    const a = seq([1, 3, 4, 9, 8, 2, 1, 5, 7, 3].map((v) => [v]));
    const b = seq([1, 6, 2, 3, 0, 9, 4, 3, 6, 3].map((v) => [v]));
    expect(dtwDistance(a, b, { bandFraction: 1 })).toBeCloseTo(15 / 20, 10);
  });

  it("is symmetric", () => {
    const a = seq([[0, 0], [1, 0.5], [2, 1], [2.5, 3]]);
    const b = seq([[0, 0.1], [0.9, 0.4], [2.2, 1.1], [2.4, 2.8], [2.6, 3.1]]);
    expect(dtwDistance(a, b)).toBeCloseTo(dtwDistance(b, a), 12);
  });

  it("stays finite for very different lengths thanks to the diagonal band", () => {
    const a = seq([[0], [1]]);
    const b = seq(Array.from({ length: 60 }, (_, i) => [i / 59]));
    expect(Number.isFinite(dtwDistance(a, b, { bandFraction: 0.05 }))).toBe(true);
  });

  it("uses Euclidean local cost across channels", () => {
    const a = seq([[0, 0]]);
    const b = seq([[3, 4]]);
    expect(dtwDistance(a, b)).toBeCloseTo(5 / 2, 12);
  });

  it("rejects mismatched channel counts", () => {
    expect(() => dtwDistance(seq([[0]]), seq([[0, 0]]))).toThrow(EngineError);
  });
});
