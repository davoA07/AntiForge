"use client";

import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { SignatureThumbnail } from "@/components/signature-thumbnail";
import { Button, Card, Field, INPUT, Notice, PageTitle } from "@/components/ui";
import {
  assessReferences,
  buildTemplate,
  EngineError,
  MIN_REFERENCES,
  RECOMMENDED_REFERENCES,
  type Signature,
} from "@/lib/engine";
import { formatSeconds, plural } from "@/lib/format";
import { useIdentities } from "@/lib/store";

interface Sample {
  id: number;
  signature: Signature;
}

export default function EnrollPage() {
  const router = useRouter();
  const { identities, add } = useIdentities();
  const padRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Signature | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assessment = useMemo(() => {
    if (samples.length < MIN_REFERENCES) return null;
    try {
      const template = buildTemplate(samples.map((s) => s.signature));
      return { template, ...assessReferences(template) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [samples]);

  const outliers = assessment && "perReference" in assessment
    ? assessment.perReference.filter((r) => r.outlier).map((r) => r.index)
    : [];

  const nameTaken = identities.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
  const canSave = name.trim().length > 0 && !nameTaken && samples.length >= MIN_REFERENCES && !saving;

  const addSample = () => {
    if (!draft) return;
    try {
      // Validate before accepting: a dot or a single flat line is unusable.
      buildTemplate([draft, draft, draft]);
    } catch (e) {
      setError(e instanceof EngineError ? e.message : "That sample could not be used.");
      return;
    }
    setError(null);
    setSamples((list) => [...list, { id: Date.now(), signature: draft }]);
    setDraft(null);
    padRef.current?.clear();
  };

  const removeSample = (id: number) => setSamples((list) => list.filter((s) => s.id !== id));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await add(name.trim(), samples.map((s) => s.signature));
      router.push("/verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this identity.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageTitle
        title="Enroll a signature"
        lede={`Sign naturally ${RECOMMENDED_REFERENCES} times. The engine measures how much you vary between your own signatures and uses that as the yardstick for everything checked later.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <Field
              label="Name"
              hint={nameTaken ? "An identity with this name already exists." : "Stored only in this browser."}
            >
              <input
                className={INPUT}
                placeholder="e.g. Ada Lovelace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">
                Sample {samples.length + 1}
                <span className="text-ink-3"> · {samples.length}/{RECOMMENDED_REFERENCES} recommended</span>
              </h2>
              {draft && (
                <span className="text-xs text-ink-3 tabular">
                  {plural(draft.strokes.length, "stroke")} · {formatSeconds(penDownMs(draft))} pen-down
                </span>
              )}
            </div>
            <SignaturePad ref={padRef} onChange={setDraft} placeholder="Sign here, at your normal speed" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={addSample} disabled={!draft} variant="secondary">
                <Plus className="h-4 w-4" /> Add this sample
              </Button>
              <Button onClick={save} disabled={!canSave}>
                {saving ? "Saving…" : `Save identity${samples.length < MIN_REFERENCES ? ` (${MIN_REFERENCES - samples.length} more needed)` : ""}`}
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
          <Card>
            <h2 className="mb-3 font-medium">Collected samples</h2>
            {samples.length === 0 ? (
              <p className="text-sm text-ink-3">
                Nothing yet. Sign in the box, then press <em>Add this sample</em>. Each sample should be a full,
                natural signature. Do not slow down to be neat.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                {samples.map((s, i) => {
                  const flagged = outliers.includes(i);
                  return (
                    <li
                      key={s.id}
                      className={`group relative rounded-lg border bg-paper p-2 ${
                        flagged ? "border-warn" : "border-line"
                      }`}
                    >
                      <SignatureThumbnail signature={s.signature} className="h-16 w-full text-ink" />
                      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-3">
                        <span className="tabular">
                          #{i + 1} · {plural(s.signature.strokes.length, "stroke")} · {formatSeconds(penDownMs(s.signature), 1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSample(s.id)}
                          className="rounded p-1 text-ink-3 hover:bg-paper-2 hover:text-forged"
                          aria-label={`Remove sample ${i + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {flagged && (
                        <AlertTriangle className="absolute right-2 top-2 h-4 w-4 text-warn" aria-label="Inconsistent sample" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {assessment && "error" in assessment && <Notice tone="bad">{assessment.error}</Notice>}

          {assessment && "template" in assessment && (
            <Card>
              <h2 className="mb-2 font-medium">Consistency check</h2>
              {assessment.consistent ? (
                <p className="flex items-start gap-2 text-sm text-ink-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
                  Your samples agree with each other. Mean distance between them:{" "}
                  <span className="font-mono tabular">{assessment.template.intra.mean.toFixed(3)}</span>
                </p>
              ) : (
                <div className="space-y-2 text-sm text-ink-2">
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                    Sample{outliers.length > 1 ? "s" : ""} {outliers.map((i) => `#${i + 1}`).join(", ")}{" "}
                    {outliers.length > 1 ? "sit" : "sits"} far from the others. An odd sample loosens the
                    acceptance band for this identity and makes forgeries easier to pass. Remove it and sign again
                    unless it really is how you normally sign.
                  </p>
                </div>
              )}
              <p className="mt-2 text-xs text-ink-3">
                {samples.length < RECOMMENDED_REFERENCES
                  ? `You can save with ${MIN_REFERENCES}, but ${RECOMMENDED_REFERENCES} samples give a much better estimate of your natural variation.`
                  : "Good sample count. Save when you are happy with the set."}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function penDownMs(sig: Signature): number {
  return sig.strokes.reduce((acc, s) => {
    const pts = s.points;
    return pts.length ? acc + pts[pts.length - 1].t - pts[0].t : acc;
  }, 0);
}
