import { describe, expect, it } from "vitest";
import { EngineError } from "./errors";
import { cleanStrokes, preprocess, resampleStroke } from "./preprocess";
import { createRng, genuineAttempt, randomWriter } from "./synthetic";
import type { RawStroke, Signature } from "./types";

const rng = createRng(7);
const writer = randomWriter(rng);
const sample = genuineAttempt(writer, rng);

function transform(
  sig: Signature,
  f: (x: number, y: number, t: number) => { x: number; y: number; t: number },
): Signature {
  return {
    ...sig,
    strokes: sig.strokes.map((s) => ({
      points: s.points.map((p) => ({ ...p, ...f(p.x, p.y, p.t) })),
    })),
  };
}

describe("resampleStroke", () => {
  it("produces a uniform grid that keeps both endpoints", () => {
    const stroke: RawStroke = {
      points: [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 0, t: 7 },
        { x: 20, y: 0, t: 21 },
        { x: 30, y: 0, t: 30 },
      ],
    };
    const r = resampleStroke(stroke, 10);
    expect(r.n).toBe(4);
    expect(r.dt).toBe(10);
    expect(r.x[0]).toBe(0);
    expect(r.x[r.n - 1]).toBe(30);
    // t = 10 lies between (7, 10) and (21, 20): 10 + (3/14) * 10
    expect(r.x[1]).toBeCloseTo(10 + (3 / 14) * 10, 10);
  });

  it("handles a stroke whose samples share a timestamp", () => {
    const r = resampleStroke(
      { points: [{ x: 0, y: 0, t: 5 }, { x: 4, y: 0, t: 5 }] },
      10,
    );
    expect(r.n).toBe(2);
    expect(r.x[1]).toBe(4);
    expect(r.dt).toBe(10);
  });
});

describe("cleanStrokes", () => {
  it("drops strokes with fewer than two finite points and sorts by time", () => {
    const cleaned = cleanStrokes([
      { points: [{ x: 0, y: 0, t: 0 }] },
      { points: [{ x: 0, y: 0, t: 2 }, { x: 1, y: 1, t: 1 }, { x: NaN, y: 0, t: 3 }] },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].points.map((p) => p.t)).toEqual([1, 2]);
  });
});

describe("preprocess", () => {
  it("throws on an empty signature", () => {
    expect(() =>
      preprocess({ strokes: [], capturedAt: 0, pointerType: "mouse", hasPressure: false }),
    ).toThrow(EngineError);
  });

  it("throws when every sample sits on one point", () => {
    const dot: Signature = {
      strokes: [{ points: [{ x: 5, y: 5, t: 0 }, { x: 5, y: 5, t: 50 }] }],
      capturedAt: 0,
      pointerType: "mouse",
      hasPressure: false,
    };
    expect(() => preprocess(dot)).toThrow(/same position/);
  });

  it("samples at roughly the requested rate", () => {
    const seq = preprocess(sample, { sampleIntervalMs: 10 });
    const expected = sample.strokes.reduce(
      (acc, s) => acc + Math.round((s.points[s.points.length - 1].t - s.points[0].t) / 10) + 1,
      0,
    );
    expect(seq.length).toBe(expected);
    expect(seq.summary.strokeCount).toBe(sample.strokes.length);
  });

  it("omits the pressure channel unless asked for it", () => {
    expect(preprocess(sample).features).not.toContain("pressure");
    expect(preprocess(sample, { usePressure: true }).features).toContain("pressure");
  });

  it("is invariant to translation and uniform scaling", () => {
    const base = preprocess(sample);
    const moved = preprocess(
      transform(sample, (x, y, t) => ({ x: x * 3.7 - 1000, y: y * 3.7 + 250, t })),
    );
    expect(moved.length).toBe(base.length);
    for (let i = 0; i < base.data.length; i++) {
      expect(moved.data[i]).toBeCloseTo(base.data[i], 8);
    }
    expect(moved.summary.pathLength).toBeCloseTo(base.summary.pathLength, 8);
  });

  it("is invariant to a shift of the clock", () => {
    const base = preprocess(sample);
    const shifted = preprocess(transform(sample, (x, y, t) => ({ x, y, t: t + 123456 })));
    expect(shifted.length).toBe(base.length);
    expect(shifted.summary.strokeCount).toBe(base.summary.strokeCount);
    expect(shifted.summary.durationMs).toBeCloseTo(base.summary.durationMs, 6);
    expect(shifted.summary.penDownMs).toBeCloseTo(base.summary.penDownMs, 6);
    expect(shifted.summary.pathLength).toBeCloseTo(base.summary.pathLength, 6);
    for (let i = 0; i < base.data.length; i++) {
      expect(shifted.data[i]).toBeCloseTo(base.data[i], 6);
    }
  });

  it("reports slower speed when the same shape is drawn more slowly", () => {
    const fast = preprocess(sample);
    const slow = preprocess(transform(sample, (x, y, t) => ({ x, y, t: t * 2 })));
    // The resampling grid realigns with the new duration, so allow ~1% slack.
    expect(slow.summary.penDownMs / fast.summary.penDownMs).toBeCloseTo(2, 2);
    expect(slow.summary.meanSpeed / fast.summary.meanSpeed).toBeCloseTo(0.5, 2);
    expect(slow.summary.pathLength / fast.summary.pathLength).toBeCloseTo(1, 2);
  });

  it("caps very long captures by thinning uniformly", () => {
    const seq = preprocess(sample, { sampleIntervalMs: 1, maxSamples: 200 });
    // Each stroke rounds its own step count, so allow one extra sample per stroke.
    expect(seq.length).toBeLessThanOrEqual(200 + 2 * sample.strokes.length);
    expect(seq.length).toBeGreaterThan(150);
  });
});
