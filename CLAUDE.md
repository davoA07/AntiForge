# AntiForge

Online signature verification that runs entirely in the browser. Next.js 16 static export, no backend.

## Layout

- `src/lib/engine/` — the verification engine. Pure TypeScript, no DOM, no framework. `preprocess` → `dtwDistance` → `buildTemplate` / `verify`. Constants in `calibration.json` are **generated** by the benchmark; never hand-edit them.
- `src/app/`, `src/components/` — the Next.js UI. All pages are client components; enrollments live in IndexedDB (`src/lib/store.ts`).
- `bench/` — SVC2004 benchmark. `pnpm bench:fetch` downloads the corpus into `bench/data/` (git-ignored); `pnpm bench` evaluates and writes `bench/results/`; `pnpm bench:calibrate` also refits `calibration.json`. The landing page and README quote `bench/results/summary.json`.

## Commands

`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm bench`.

## Conventions

- Engine changes must keep `pnpm test` green and be re-benchmarked; commit the regenerated `bench/results/` and `calibration.json` together with the change.
- Keep the engine free of browser or Node APIs so the same code runs in the bench and in the page.
- Prefer explaining a decision (factors, distances) over exposing a bare boolean.
