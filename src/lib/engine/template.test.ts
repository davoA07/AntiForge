import { describe, expect, it } from "vitest";
import { dtwDistance } from "./dtw";
import { preprocess, smooth } from "./preprocess";
import { createRng, genuineAttempt, randomWriter } from "./synthetic";
import { buildTemplate } from "./template";

describe("smooth", () => {
  it("averages over a centred window and keeps the endpoints", () => {
    const out = smooth(new Float64Array([0, 10, 0, 10, 0]), 3);
    expect(Array.from(out)).toEqual([0, 10 / 3, 20 / 3, 10 / 3, 0]);
  });

  it("is the identity for a window of one", () => {
    const values = new Float64Array([3, 1, 4, 1, 5]);
    expect(Array.from(smooth(values, 1))).toEqual(Array.from(values));
  });
});

describe("channel groups", () => {
  const rng = createRng(11);
  const writer = randomWriter(rng);
  const refs = Array.from({ length: 4 }, () => genuineAttempt(writer, rng));
  const template = buildTemplate(refs);

  it("resolves group channels against the reference feature list", () => {
    const names = template.references[0].features;
    expect(template.groups.shape.channels.map((i) => names[i])).toEqual(["x", "y", "dirX", "dirY"]);
    // No pressure on mouse input, so the dynamics group drops it.
    expect(template.groups.dynamics.channels.map((i) => names[i])).toEqual(["vx", "vy", "speed"]);
  });

  it("restricts the DTW local cost to the requested channels", () => {
    const a = template.references[0];
    const b = template.references[1];
    const full = dtwDistance(a, b);
    const shape = dtwDistance(a, b, { channels: template.groups.shape.channels });
    const dyn = dtwDistance(a, b, { channels: template.groups.dynamics.channels });
    expect(shape).toBeLessThan(full);
    expect(dyn).toBeLessThan(full);
    expect(template.groups.shape.pairwise[0][1]).toBeCloseTo(shape, 12);
    expect(template.groups.dynamics.pairwise[0][1]).toBeCloseTo(dyn, 12);
  });

  it("keeps the group matrices symmetric with the same shape as the full one", () => {
    for (const g of ["shape", "dynamics"] as const) {
      const m = template.groups[g].pairwise;
      expect(m).toHaveLength(refs.length);
      for (let i = 0; i < m.length; i++) {
        expect(m[i][i]).toBe(0);
        for (let j = 0; j < m.length; j++) expect(m[i][j]).toBe(m[j][i]);
      }
      expect(template.groups[g].intra.mean).toBeGreaterThan(0);
    }
  });

  it("smoothing changes derived speed but not the sample count", () => {
    const raw = preprocess(refs[0], { smoothingWindow: 1 });
    const smoothed = preprocess(refs[0], { smoothingWindow: 5 });
    expect(smoothed.length).toBe(raw.length);
    expect(smoothed.summary.strokeCount).toBe(raw.summary.strokeCount);
    expect(smoothed.summary.pathLength).toBeLessThanOrEqual(raw.summary.pathLength + 1e-9);
  });
});
