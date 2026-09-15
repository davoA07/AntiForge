import { describe, expect, it } from "vitest";
import { isGenuineSample, parseFileName, parseSvc2004 } from "./svc2004";

const TASK2 = [
  "7",
  "100 200 1000 0 1500 700 400",
  "100 200 1010 1 1500 700 420",
  "110 210 1020 1 1500 700 800",
  "120 220 1030 0 1500 700 100",
  "300 400 1200 1 1500 700 600",
  "310 410 1210 1 1500 700 600",
  "320 420 1220 0 1500 700 50",
].join("\r\n");

describe("parseSvc2004", () => {
  it("groups pen-down runs into strokes and closes each at the pen-up sample", () => {
    const sig = parseSvc2004(TASK2, 2);
    expect(sig.strokes).toHaveLength(2);
    expect(sig.strokes[0].points.map((p) => p.t)).toEqual([1000, 1010, 1020, 1030]);
    expect(sig.strokes[1].points.map((p) => p.t)).toEqual([1200, 1210, 1220]);
    expect(sig.hasPressure).toBe(true);
    expect(sig.pointerType).toBe("pen");
  });

  it("flips the y axis and normalises pressure by the file maximum", () => {
    const sig = parseSvc2004(TASK2, 2);
    expect(sig.strokes[0].points[0].y).toBe(-200);
    expect(sig.strokes[0].points[2].p).toBe(1);
    expect(sig.strokes[0].points[0].p).toBeCloseTo(0.5, 10);
  });

  it("reads Task 1 files without pressure", () => {
    const text = ["3", "1 2 10 0", "1 2 20 1", "3 4 30 0"].join("\n");
    const sig = parseSvc2004(text, 1);
    expect(sig.strokes).toHaveLength(1);
    expect(sig.hasPressure).toBe(false);
    expect(sig.strokes[0].points[0].p).toBeUndefined();
  });

  it("honours the declared sample count", () => {
    const text = ["2", "1 2 10 0", "1 2 20 1", "9 9 99 1"].join("\n");
    const sig = parseSvc2004(text, 1);
    expect(sig.strokes[0].points).toHaveLength(2);
  });
});

describe("file naming", () => {
  it("parses user and sample ids", () => {
    expect(parseFileName("U12S34.TXT")).toEqual({ user: 12, sample: 34 });
    expect(parseFileName("readme.txt")).toBeNull();
  });

  it("labels samples 1-20 genuine and 21-40 forged", () => {
    expect(isGenuineSample(1)).toBe(true);
    expect(isGenuineSample(20)).toBe(true);
    expect(isGenuineSample(21)).toBe(false);
  });
});
