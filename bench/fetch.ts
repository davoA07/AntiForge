/**
 * Download SVC2004 Task 1 and Task 2 into bench/data/.
 * The corpus is distributed by HKUST for research use and is not committed
 * to this repository. See https://www.cse.ust.hk/svc2004/
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { DATA_DIR } from "./paths";

const BASE_URL = "https://www.cse.ust.hk/svc2004";

async function fetchTask(task: 1 | 2): Promise<void> {
  const target = join(DATA_DIR, `Task${task}`);
  if (existsSync(join(target, "U1S1.TXT"))) {
    console.log(`Task${task}: already present, skipping.`);
    return;
  }
  const url = `${BASE_URL}/Task${task}.zip`;
  console.log(`Downloading ${url} ...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const files = unzipSync(bytes);
  let count = 0;
  for (const [path, data] of Object.entries(files)) {
    if (!path.toUpperCase().endsWith(".TXT")) continue;
    const out = join(DATA_DIR, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
    count++;
  }
  console.log(`Task${task}: wrote ${count} files.`);
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  await fetchTask(1);
  await fetchTask(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
