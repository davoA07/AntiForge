import { describe, expect, it } from "vitest";
import { fitLogistic, sigmoid } from "./logistic";

describe("fitLogistic", () => {
  it("separates a linearly separable set", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 200; i++) {
      const a = (i % 20) / 10 - 1;
      const b = Math.floor(i / 20) / 5 - 1;
      X.push([a, b]);
      y.push(a + 0.5 * b > 0.1 ? 1 : 0);
    }
    const fit = fitLogistic(X, y, { lambda: 1e-3 });
    let correct = 0;
    X.forEach((row, i) => {
      const p = sigmoid(row[0] * fit.weights[0] + row[1] * fit.weights[1] + fit.bias);
      if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;
    });
    expect(correct / X.length).toBeGreaterThan(0.97);
    expect(fit.weights[0]).toBeGreaterThan(0);
    expect(fit.logLoss).toBeLessThan(0.2);
  });

  it("returns a bias close to the log-odds when features carry no signal", () => {
    const X = Array.from({ length: 100 }, () => [0]);
    const y = Array.from({ length: 100 }, (_, i) => (i < 75 ? 1 : 0));
    const fit = fitLogistic(X, y);
    expect(sigmoid(fit.bias)).toBeCloseTo(0.75, 3);
  });
});
