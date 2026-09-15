import { describe, expect, it } from "vitest";
import { areaUnderCurve, equalErrorRate, errorRates, ratesAt, rocCurve } from "./metrics";

describe("rocCurve", () => {
  it("starts at accept-all and ends at reject-all", () => {
    const roc = rocCurve([0.9, 0.8], [0.1, 0.2]);
    expect(roc[0]).toEqual({ threshold: -Infinity, far: 1, frr: 0 });
    expect(roc[roc.length - 1]).toEqual({ threshold: Infinity, far: 0, frr: 1 });
  });

  it("computes FAR and FRR at a threshold", () => {
    expect(ratesAt([0.9, 0.6, 0.3], [0.1, 0.5, 0.7], 0.55)).toEqual({
      far: 1 / 3,
      frr: 1 / 3,
    });
  });
});

describe("equalErrorRate", () => {
  it("is zero for perfectly separable scores", () => {
    const { eer } = errorRates([0.9, 0.8, 0.7], [0.1, 0.2, 0.3]);
    expect(eer).toBe(0);
  });

  it("is one half when scores are indistinguishable", () => {
    const { eer } = errorRates([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    expect(eer).toBeCloseTo(0.5, 6);
  });

  it("interpolates between the crossing points", () => {
    const roc = [
      { threshold: 0, far: 0.6, frr: 0.1 },
      { threshold: 1, far: 0.2, frr: 0.3 },
    ];
    const { eer, threshold } = equalErrorRate(roc);
    // da = 0.5, db = -0.1 → alpha = 5/6 → eer = 0.6 - (5/6)*0.4
    expect(eer).toBeCloseTo(0.6 - (5 / 6) * 0.4, 10);
    expect(threshold).toBeCloseTo(5 / 6, 10);
  });
});

describe("areaUnderCurve", () => {
  it("is one for perfect ranking, one half for ties", () => {
    expect(areaUnderCurve([2, 3], [0, 1])).toBe(1);
    expect(areaUnderCurve([1, 1], [1, 1])).toBe(0.5);
    expect(areaUnderCurve([0, 1], [2, 3])).toBe(0);
  });
});
