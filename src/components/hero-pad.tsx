"use client";

import { useState } from "react";
import { preprocess, type Signature } from "@/lib/engine";
import { formatSeconds } from "@/lib/format";
import { SignaturePad } from "./signature-pad";
import { SignatureReplay } from "./signature-replay";

/** Landing-page demo: sign anything, see it replayed with speed colouring. */
export function HeroPad() {
  const [signature, setSignature] = useState<Signature | null>(null);
  const summary = (() => {
    if (!signature) return null;
    try {
      return preprocess(signature).summary;
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-paper-2/40 p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Try the capture</h2>
        <span className="text-xs text-ink-3">Nothing is stored</span>
      </div>
      <SignaturePad onChange={setSignature} height={200} placeholder="Sign anything" />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="rounded-lg border border-line bg-paper p-2">
          {signature ? (
            <SignatureReplay key={signature.capturedAt} signature={signature} autoplay className="h-28" />
          ) : (
            <div className="flex h-28 items-center justify-center text-center text-sm text-ink-3">
              Your signature will replay here at real speed, coloured by how fast the pen moved.
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-1 sm:content-start">
          <Row k="Strokes" v={summary ? String(summary.strokeCount) : "–"} />
          <Row k="Pen-down" v={summary ? formatSeconds(summary.penDownMs) : "–"} />
          <Row k="Paused" v={summary ? formatSeconds(summary.pauseMs) : "–"} />
          <Row k="Samples" v={summary ? String(summary.sampleCount) : "–"} />
          <Row k="Input" v={signature ? signature.pointerType : "–"} />
        </dl>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 sm:min-w-28">
      <dt className="text-ink-3">{k}</dt>
      <dd className="font-mono tabular">{v}</dd>
    </div>
  );
}
