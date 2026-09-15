import { ArrowRight } from "lucide-react";
import { HeroPad } from "@/components/hero-pad";
import { RocChart } from "@/components/roc-chart";
import { ButtonLink } from "@/components/ui";
import { BENCH } from "@/lib/bench";
import { formatPercent } from "@/lib/format";
import { GITHUB_URL } from "@/lib/site";

export default function HomePage() {
  const t2 = BENCH.tasks.task2;
  const t1 = BENCH.tasks.task1;
  const heldOut = Math.max(BENCH.crossFit.fitTask1_evalTask2.skilledEer, BENCH.crossFit.fitTask2_evalTask1.skilledEer);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-14">
        <div className="space-y-6">
          <p className="text-sm uppercase tracking-[0.18em] text-ink-3">Online signature verification</p>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            A signature is verified by how it was written, not how it looks.
          </h1>
          <p className="max-w-xl text-lg text-ink-2">
            A forger can copy a shape. Copying your pen speed, your rhythm, the way you accelerate into a loop and
            hesitate before a crossbar is far harder. AntiForge records the act of signing and compares that.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/enroll">
              Enroll your signature <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="#method" variant="secondary">
              How it works
            </ButtonLink>
          </div>
          <p className="text-sm text-ink-3">
            No account, no upload. Capture, matching and storage all happen in your browser.
          </p>
        </div>
        <HeroPad />
      </section>

      <section className="grid gap-4 border-y border-line py-8 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={formatPercent(t2.skilled.eer)} label="equal error rate, skilled forgeries" hint="SVC2004 Task 2, one global threshold" />
        <Stat value={formatPercent(t2.random.eer)} label="equal error rate, random forgeries" hint="other writers' signatures" />
        <Stat value={formatPercent(heldOut)} label="held-out skilled EER" hint="fitted on one task, scored on the other" />
        <Stat value={`${BENCH.protocol.users * 2}`} label="writers benchmarked" hint={`${BENCH.protocol.references} references each`} />
      </section>

      <section id="method" className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <h2 className="font-display text-3xl tracking-tight">How it works</h2>
          <ol className="space-y-6">
            <Step n={1} title="Capture the act, not the picture">
              Every pointer sample is recorded with a high-resolution timestamp, plus pressure on pens. The result is a
              trajectory: where the pen was, when, and how fast it was moving.
            </Step>
            <Step n={2} title="Normalise what a forger can copy">
              Each signature is resampled at 100 Hz, centred, and scaled to unit size. Position on the page and overall
              size carry no weight. Per-sample velocity, speed and direction are derived from the timestamps.
            </Step>
            <Step n={3} title="Align with Dynamic Time Warping">
              Two signatures never take exactly the same time. DTW finds the best point-to-point alignment inside a band
              around the diagonal and sums the remaining differences across all feature channels.
            </Step>
            <Step n={4} title="Judge against the writer's own variation">
              Enrollment measures how far your signatures are from each other. An attempt is scored by its distance to
              your references relative to that spread, plus pen-down time and stroke count, through a logistic model
              fitted on the public SVC2004 corpus.
            </Step>
          </ol>
          <p className="text-sm text-ink-3">
            The whole pipeline is about 500 lines of dependency-free TypeScript in{" "}
            <a className="underline hover:text-ink" href={`${GITHUB_URL}/tree/main/src/lib/engine`} target="_blank" rel="noreferrer">
              src/lib/engine
            </a>
            . The benchmark that produced the numbers on this page is reproducible with <code className="font-mono text-xs">pnpm bench</code>.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="font-medium">Benchmark on SVC2004</h3>
          <p className="text-sm text-ink-2">
            {BENCH.protocol.users} writers per task, enrolled from {BENCH.protocol.references} genuine signatures,
            then tested on {BENCH.protocol.genuinePerUser} further genuine signatures, {BENCH.protocol.skilledPerUser}{" "}
            skilled forgeries made by people who practised the signature, and {BENCH.protocol.randomPerUser} random
            forgeries. Task 1 has coordinates and time only; Task 2 adds pen pressure.
          </p>
          <RocChart className="rounded-2xl border border-line bg-paper-2/40 p-4" />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="py-1 font-normal">Task</th>
                <th className="py-1 font-normal">Skilled EER</th>
                <th className="py-1 font-normal">Random EER</th>
                <th className="py-1 font-normal">Per-writer EER</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {[t1, t2].map((t) => (
                <tr key={t.name} className="border-t border-line">
                  <td className="py-1.5">{t.name}</td>
                  <td className="py-1.5">{formatPercent(t.skilled.eer)}</td>
                  <td className="py-1.5">{formatPercent(t.random.eer)}</td>
                  <td className="py-1.5">{formatPercent(t.userDependentEer)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-3">
            &ldquo;Per-writer EER&rdquo; assumes a separately tuned threshold for each writer, which is how many papers
            report results; the headline numbers above use one threshold for everyone, which is what this app ships.
          </p>
        </div>
      </section>

      <section className="border-t border-line py-14">
        <h2 className="font-display text-3xl tracking-tight">Limits, stated plainly</h2>
        <ul className="mt-6 grid gap-4 text-sm text-ink-2 sm:grid-cols-2">
          <li className="rounded-xl border border-line p-4">
            <strong className="text-ink">Mouse is not pen.</strong> SVC2004 was captured on a tablet. Trackpad and mouse
            signatures have coarser dynamics, so real-world error rates will be worse than the benchmark.
          </li>
          <li className="rounded-xl border border-line p-4">
            <strong className="text-ink">Skilled, practised forgers get through.</strong> Roughly one in ten skilled
            forgeries in SVC2004 passes at the equal-error operating point. This is a demonstration of the technique,
            not an access control.
          </li>
          <li className="rounded-xl border border-line p-4">
            <strong className="text-ink">Five samples is a small estimate.</strong> The writer&apos;s variation is
            measured from ten pairwise distances. An unusual enrollment sample widens the band noticeably, which is why
            enrollment flags outliers.
          </li>
          <li className="rounded-xl border border-line p-4">
            <strong className="text-ink">No liveness, no anti-replay.</strong> The raw trajectory is what gets compared.
            Anyone with a recording of it can replay it. Server-side use would need a challenge and device attestation.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div>
      <div className="font-mono text-3xl tabular">{value}</div>
      <div className="text-sm text-ink-2">{label}</div>
      <div className="text-xs text-ink-3">{hint}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line font-mono text-sm">
        {n}
      </span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-ink-2">{children}</p>
      </div>
    </li>
  );
}
