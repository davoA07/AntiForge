/**
 * Biometric error-rate metrics. Scores follow the convention "higher means
 * more likely genuine"; a trial is accepted when score >= threshold.
 */

export interface RocPoint {
  threshold: number;
  far: number;
  frr: number;
}

export interface ErrorRates {
  eer: number;
  eerThreshold: number;
  auc: number;
  roc: RocPoint[];
}

/** FAR/FRR at every distinct threshold, from accept-everything to reject-everything. */
export function rocCurve(genuine: number[], forgery: number[]): RocPoint[] {
  const g = genuine.slice().sort((a, b) => a - b);
  const f = forgery.slice().sort((a, b) => a - b);
  const thresholds = Array.from(new Set([...g, ...f])).sort((a, b) => a - b);
  const points: RocPoint[] = [{ threshold: -Infinity, far: 1, frr: 0 }];
  for (const t of thresholds) {
    const rejectedGenuine = lowerBound(g, t); // genuine scores < t
    const acceptedForgery = f.length - lowerBound(f, t); // forgery scores >= t
    points.push({
      threshold: t,
      far: f.length ? acceptedForgery / f.length : 0,
      frr: g.length ? rejectedGenuine / g.length : 0,
    });
  }
  points.push({ threshold: Infinity, far: 0, frr: 1 });
  return points;
}

/** Equal error rate, linearly interpolated between the two ROC points where FAR and FRR cross. */
export function equalErrorRate(roc: RocPoint[]): {
  eer: number;
  threshold: number;
} {
  for (let i = 1; i < roc.length; i++) {
    const a = roc[i - 1];
    const b = roc[i];
    const da = a.far - a.frr;
    const db = b.far - b.frr;
    if (da === 0) return { eer: a.far, threshold: a.threshold };
    if (da > 0 && db <= 0) {
      const alpha = da / (da - db);
      const eer = a.far + alpha * (b.far - a.far);
      const threshold =
        Number.isFinite(a.threshold) && Number.isFinite(b.threshold)
          ? a.threshold + alpha * (b.threshold - a.threshold)
          : Number.isFinite(b.threshold)
            ? b.threshold
            : a.threshold;
      return { eer, threshold };
    }
  }
  const last = roc[roc.length - 1];
  return { eer: last.far, threshold: last.threshold };
}

/** Area under the ROC curve via the rank statistic (probability a genuine outscores a forgery). */
export function areaUnderCurve(genuine: number[], forgery: number[]): number {
  if (genuine.length === 0 || forgery.length === 0) return 0;
  const f = forgery.slice().sort((a, b) => a - b);
  let sum = 0;
  for (const s of genuine) {
    const below = lowerBound(f, s);
    const equal = upperBound(f, s) - below;
    sum += below + 0.5 * equal;
  }
  return sum / (genuine.length * forgery.length);
}

export function errorRates(genuine: number[], forgery: number[]): ErrorRates {
  const roc = rocCurve(genuine, forgery);
  const { eer, threshold } = equalErrorRate(roc);
  return {
    eer,
    eerThreshold: threshold,
    auc: areaUnderCurve(genuine, forgery),
    roc,
  };
}

/** FAR and FRR at a fixed operating threshold. */
export function ratesAt(
  genuine: number[],
  forgery: number[],
  threshold: number,
): { far: number; frr: number } {
  const far = forgery.length
    ? forgery.filter((s) => s >= threshold).length / forgery.length
    : 0;
  const frr = genuine.length
    ? genuine.filter((s) => s < threshold).length / genuine.length
    : 0;
  return { far, frr };
}

function lowerBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
