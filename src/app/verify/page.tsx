"use client";

import { useMemo, useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { Button, ButtonLink, Card, Field, INPUT, Notice, PageTitle } from "@/components/ui";
import { VerdictCard } from "@/components/verdict-card";
import { buildTemplate, verify, type Signature, type VerificationResult } from "@/lib/engine";
import { useIdentities } from "@/lib/store";

export default function VerifyPage() {
  const { identities, loading } = useIdentities();
  const padRef = useRef<SignaturePadHandle>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<Signature | null>(null);
  const [trace, setTrace] = useState(false);
  const [outcome, setOutcome] = useState<{ result: VerificationResult; query: Signature } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fall back to the most recent identity until the user picks one.
  const identity = identities.find((i) => i.id === selectedId) ?? identities[0] ?? null;

  const template = useMemo(() => {
    if (!identity) return null;
    try {
      return buildTemplate(identity.references);
    } catch {
      return null;
    }
  }, [identity]);

  const run = () => {
    if (!template || !draft) return;
    try {
      setOutcome({ result: verify(template, draft), query: draft });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    }
  };

  const reset = () => {
    setOutcome(null);
    setDraft(null);
    padRef.current?.clear();
  };

  if (!loading && identities.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <PageTitle title="Verify a signature" />
        <Card>
          <p className="text-ink-2">No identities are enrolled in this browser yet.</p>
          <div className="mt-4">
            <ButtonLink href="/enroll">Enroll a signature first</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageTitle
        title="Verify a signature"
        lede="Claim an identity and sign. Then try to forge it: trace the ghost outline slowly and watch what the timing gives away."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="I claim to be">
                <select
                  className={INPUT}
                  value={identity?.id ?? ""}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setOutcome(null);
                  }}
                  disabled={loading}
                >
                  {identities.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · {i.references.length} samples
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={trace}
                  onChange={(e) => setTrace(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Show ghost to trace
              </label>
            </div>
          </Card>

          <Card>
            <SignaturePad
              ref={padRef}
              onChange={(sig) => {
                setDraft(sig);
                setOutcome(null);
              }}
              ghost={trace && identity ? identity.references[0] : null}
              placeholder={trace ? "Trace the ghost" : `Sign as ${identity?.name ?? "…"}`}
              disabled={!template}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={run} disabled={!draft || !template}>
                Verify
              </Button>
              <Button onClick={reset} variant="secondary" disabled={!draft && !outcome}>
                Start over
              </Button>
            </div>
            {error && (
              <div className="mt-3">
                <Notice tone="bad">{error}</Notice>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {outcome && identity ? (
            <VerdictCard result={outcome.result} query={outcome.query} references={identity.references} />
          ) : (
            <Card>
              <h2 className="mb-2 font-medium">What gets compared</h2>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
                <li>Your attempt is resampled at 100 Hz, centred and scaled, so position and size do not matter.</li>
                <li>
                  Every sample carries position, velocity, speed and direction. Dynamic Time Warping aligns the attempt
                  with each enrolled signature and sums how far apart they are.
                </li>
                <li>
                  Those distances are divided by how far the enrolled signatures are from <em>each other</em>. A
                  consistent signer is held to a tight band; a loose one gets more room.
                </li>
                <li>A logistic model fitted on SVC2004 turns the result into a probability.</li>
              </ol>
              {template && (
                <p className="mt-3 text-xs text-ink-3 tabular">
                  {identity?.name}: {template.references.length} references, spread {template.intra.min.toFixed(3)}–
                  {template.intra.max.toFixed(3)} (mean {template.intra.mean.toFixed(3)})
                  {template.hasPressure ? ", pressure enabled" : ""}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
