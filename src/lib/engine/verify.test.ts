import { describe, expect, it } from "vitest";
import { EngineError } from "./errors";
import {
  createRng,
  genuineAttempt,
  randomForgery,
  randomWriter,
  tracedForgery,
} from "./synthetic";
import { assessReferences, buildTemplate, MIN_REFERENCES } from "./template";
import { verify } from "./verify";

describe("buildTemplate", () => {
  it("requires the minimum number of references", () => {
    const rng = createRng(1);
    const writer = randomWriter(rng);
    const refs = Array.from({ length: MIN_REFERENCES - 1 }, () => genuineAttempt(writer, rng));
    expect(() => buildTemplate(refs)).toThrow(EngineError);
  });

  it("computes a symmetric pairwise matrix and positive spread", () => {
    const rng = createRng(2);
    const writer = randomWriter(rng);
    const refs = Array.from({ length: 5 }, () => genuineAttempt(writer, rng));
    const template = buildTemplate(refs);
    expect(template.references).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(template.pairwise[i][i]).toBe(0);
      for (let j = 0; j < 5; j++) {
        expect(template.pairwise[i][j]).toBe(template.pairwise[j][i]);
      }
    }
    expect(template.intra.mean).toBeGreaterThan(0);
    expect(template.intra.min).toBeLessThanOrEqual(template.intra.max);
  });

  it("uses pressure only when every reference has it", () => {
    const rng = createRng(3);
    const writer = randomWriter(rng);
    const withPressure = Array.from({ length: 3 }, () =>
      genuineAttempt(writer, rng, { pressure: true }),
    );
    expect(buildTemplate(withPressure).hasPressure).toBe(true);
    const mixed = [...withPressure.slice(0, 2), genuineAttempt(writer, rng)];
    expect(buildTemplate(mixed).hasPressure).toBe(false);
  });
});

describe("assessReferences", () => {
  it("flags a reference that belongs to a different writer", () => {
    const rng = createRng(4);
    const writer = randomWriter(rng);
    const refs = Array.from({ length: 4 }, () => genuineAttempt(writer, rng));
    refs.push(randomForgery(rng));
    const assessment = assessReferences(buildTemplate(refs));
    expect(assessment.consistent).toBe(false);
    expect(assessment.perReference[4].outlier).toBe(true);
    expect(assessment.perReference.slice(0, 4).every((r) => !r.outlier)).toBe(true);
  });

  it("accepts a consistent set", () => {
    const rng = createRng(5);
    const writer = randomWriter(rng);
    const refs = Array.from({ length: 5 }, () => genuineAttempt(writer, rng));
    expect(assessReferences(buildTemplate(refs)).consistent).toBe(true);
  });
});

describe("verify", () => {
  const rng = createRng(42);
  const writers = Array.from({ length: 6 }, () => randomWriter(rng));
  const templates = writers.map((w) =>
    buildTemplate(Array.from({ length: 5 }, () => genuineAttempt(w, rng))),
  );

  it("scores genuine attempts above traced and random forgeries", () => {
    let genuineMin = Infinity;
    let tracedMax = -Infinity;
    let randomMax = -Infinity;
    writers.forEach((w, i) => {
      for (let k = 0; k < 4; k++) {
        genuineMin = Math.min(genuineMin, verify(templates[i], genuineAttempt(w, rng)).probability);
        tracedMax = Math.max(tracedMax, verify(templates[i], tracedForgery(w, rng)).probability);
        randomMax = Math.max(randomMax, verify(templates[i], randomForgery(rng)).probability);
      }
    });
    expect(genuineMin).toBeGreaterThan(tracedMax);
    expect(genuineMin).toBeGreaterThan(randomMax);
  });

  it("accepts genuine attempts and rejects forgeries at the shipped threshold", () => {
    const w = writers[0];
    const t = templates[0];
    for (let k = 0; k < 5; k++) {
      expect(verify(t, genuineAttempt(w, rng)).genuine).toBe(true);
      expect(verify(t, tracedForgery(w, rng)).genuine).toBe(false);
      expect(verify(t, randomForgery(rng)).genuine).toBe(false);
    }
  });

  it("explains a traced forgery by its slow pen-down time", () => {
    const result = verify(templates[1], tracedForgery(writers[1], rng));
    const duration = result.factors.find((f) => f.key === "duration");
    expect(duration?.severity).toBe("bad");
    expect(result.scoreFeatures.logDuration).toBeGreaterThan(Math.log(1.8));
    expect(result.distances).toHaveLength(5);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
  });

  it("ignores pressure in the query when the template has none", () => {
    const w = writers[2];
    const withPressure = genuineAttempt(w, rng, { pressure: true });
    expect(() => verify(templates[2], withPressure)).not.toThrow();
  });
});
