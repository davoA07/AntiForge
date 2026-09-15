/**
 * Reader for the SVC2004 online signature corpus.
 *
 * Layout: `<dir>/Task1/U{user}S{sample}.TXT` and `<dir>/Task2/...`.
 * Each file starts with the sample count, then one line per sample:
 *   Task 1: X Y T BUTTON
 *   Task 2: X Y T BUTTON AZIMUTH ALTITUDE PRESSURE
 * BUTTON is 1 while the pen touches the tablet. A BUTTON=0 line marks the
 * position where the pen lifted (or, on the very first line, where it landed).
 * Samples 1-20 of each user are genuine; 21-40 are skilled forgeries.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RawPoint, RawStroke, Signature } from "../src/lib/engine/types";

export type Task = 1 | 2;

export const USERS_PER_TASK = 40;
export const SAMPLES_PER_USER = 40;
export const GENUINE_PER_USER = 20;

export interface Svc2004Sample {
  user: number;
  sample: number;
  genuine: boolean;
  signature: Signature;
}

export function isGenuineSample(sample: number): boolean {
  return sample >= 1 && sample <= GENUINE_PER_USER;
}

/** Parse the text of one SVC2004 file into a Signature. */
export function parseSvc2004(text: string, task: Task): Signature {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("SVC2004 file has no samples.");
  const declared = Number.parseInt(lines[0], 10);
  const rows = lines.slice(1, 1 + declared);

  const strokes: RawStroke[] = [];
  let current: RawPoint[] | null = null;
  let maxPressure = 0;

  for (const row of rows) {
    const cols = row.trim().split(/\s+/).map(Number);
    const [x, y, t, button] = cols;
    const pressure = task === 2 ? cols[6] : undefined;
    if (pressure !== undefined && pressure > maxPressure) maxPressure = pressure;
    // Tablet y grows upward; flip so that screen captures and tablet data share a convention.
    const point: RawPoint = { x, y: -y, t, p: pressure };
    if (button === 1) {
      if (!current) current = [];
      current.push(point);
    } else if (current) {
      // Pen-up sample: closes the current stroke at the lift position.
      current.push(point);
      strokes.push({ points: current });
      current = null;
    } else {
      // Leading pen-up sample: the landing position, start of the first stroke.
      current = [point];
    }
  }
  if (current && current.length >= 2) strokes.push({ points: current });

  if (task === 2 && maxPressure > 0) {
    for (const stroke of strokes) {
      for (const pt of stroke.points) pt.p = (pt.p ?? 0) / maxPressure;
    }
  }

  return {
    strokes,
    capturedAt: 0,
    pointerType: "pen",
    hasPressure: task === 2,
  };
}

export function parseFileName(
  name: string,
): { user: number; sample: number } | null {
  const match = /^U(\d+)S(\d+)\.TXT$/i.exec(name);
  if (!match) return null;
  return { user: Number(match[1]), sample: Number(match[2]) };
}

/** Load every sample of one task, grouped by user and ordered by sample index. */
export function loadTask(
  dataDir: string,
  task: Task,
): Map<number, Svc2004Sample[]> {
  const dir = join(dataDir, `Task${task}`);
  const byUser = new Map<number, Svc2004Sample[]>();
  for (const name of readdirSync(dir)) {
    const id = parseFileName(name);
    if (!id) continue;
    const signature = parseSvc2004(
      readFileSync(join(dir, name), "latin1"),
      task,
    );
    const list = byUser.get(id.user) ?? [];
    list.push({
      user: id.user,
      sample: id.sample,
      genuine: isGenuineSample(id.sample),
      signature,
    });
    byUser.set(id.user, list);
  }
  for (const list of byUser.values()) list.sort((a, b) => a.sample - b.sample);
  return byUser;
}
