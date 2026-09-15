/**
 * L2-regularised logistic regression fitted with Newton's method (IRLS).
 * Small enough to live here; the problem has five features and ~3000 rows.
 */

export interface LogisticFit {
  weights: number[];
  bias: number;
  iterations: number;
  logLoss: number;
}

export function fitLogistic(
  X: number[][],
  y: number[],
  options: { lambda?: number; maxIterations?: number; tolerance?: number } = {},
): LogisticFit {
  const lambda = options.lambda ?? 1e-2;
  const maxIterations = options.maxIterations ?? 50;
  const tolerance = options.tolerance ?? 1e-8;
  const n = X.length;
  const p = X[0].length;
  const dim = p + 1; // bias last
  const beta = new Array<number>(dim).fill(0);

  const rowOf = (i: number): number[] => [...X[i], 1];
  let iterations = 0;

  for (; iterations < maxIterations; iterations++) {
    const gradient = new Array<number>(dim).fill(0);
    const hessian: number[][] = Array.from({ length: dim }, () =>
      new Array<number>(dim).fill(0),
    );
    for (let i = 0; i < n; i++) {
      const row = rowOf(i);
      const prob = sigmoid(dot(row, beta));
      const residual = y[i] - prob;
      const weight = prob * (1 - prob);
      for (let a = 0; a < dim; a++) {
        gradient[a] += row[a] * residual;
        for (let b = 0; b < dim; b++) hessian[a][b] += weight * row[a] * row[b];
      }
    }
    for (let a = 0; a < p; a++) {
      gradient[a] -= lambda * beta[a];
      hessian[a][a] += lambda;
    }
    hessian[p][p] += 1e-9;
    const step = solve(hessian, gradient);
    let maxStep = 0;
    for (let a = 0; a < dim; a++) {
      beta[a] += step[a];
      maxStep = Math.max(maxStep, Math.abs(step[a]));
    }
    if (maxStep < tolerance) break;
  }

  let logLoss = 0;
  for (let i = 0; i < n; i++) {
    const prob = clamp(sigmoid(dot(rowOf(i), beta)), 1e-12, 1 - 1e-12);
    logLoss -= y[i] ? Math.log(prob) : Math.log(1 - prob);
  }

  return {
    weights: beta.slice(0, p),
    bias: beta[p],
    iterations,
    logLoss: logLoss / Math.max(1, n),
  };
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const diag = M[col][col];
    if (Math.abs(diag) < 1e-15) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-15 ? 0 : row[n] / row[i]));
}
