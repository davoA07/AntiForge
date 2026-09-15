"use client";

import { Download, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { SignatureThumbnail } from "@/components/signature-thumbnail";
import { Button, ButtonLink, Card, Notice, PageTitle } from "@/components/ui";
import { formatDate, plural } from "@/lib/format";
import { exportIdentities, parseIdentities, useIdentities } from "@/lib/store";

export default function IdentitiesPage() {
  const { identities, loading, remove, replace, merge } = useIdentities();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const download = () => {
    const blob = new Blob([exportIdentities(identities)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `antiforge-identities-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const added = await merge(parseIdentities(await file.text()));
      setMessage({
        tone: "ok",
        text: added === 1 ? "Imported 1 new identity." : `Imported ${added} new identities.`,
      });
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Import failed." });
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Delete every enrolled identity in this browser? This cannot be undone.")) return;
    await replace([]);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageTitle
        title="Identities"
        lede="Everything here lives in this browser's IndexedDB. Export a file to move identities to another device, or to keep a backup."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <ButtonLink href="/enroll">Enroll new</ButtonLink>
        <Button variant="secondary" onClick={download} disabled={identities.length === 0}>
          <Download className="h-4 w-4" /> Export JSON
        </Button>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          <Upload className="h-4 w-4" /> Import JSON
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
        <Button variant="danger" onClick={clearAll} disabled={identities.length === 0} className="ml-auto">
          <Trash2 className="h-4 w-4" /> Delete all
        </Button>
      </div>

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : identities.length === 0 ? (
        <Card>
          <p className="text-ink-2">No identities yet.</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {identities.map((identity) => (
            <li key={identity.id}>
              <Card>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{identity.name}</h2>
                    <p className="text-xs text-ink-3">
                      {plural(identity.references.length, "sample")} · enrolled {formatDate(identity.createdAt)}
                      {identity.references[0]?.pointerType && ` · ${identity.references[0].pointerType}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(identity.id)}
                    className="rounded-md p-1.5 text-ink-3 hover:bg-forged-soft hover:text-forged"
                    aria-label={`Delete ${identity.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {identity.references.map((sig, i) => (
                    <div key={i} className="rounded-md border border-line bg-paper p-1">
                      <SignatureThumbnail signature={sig} className="h-10 w-full text-ink" strokeWidth={1.5} />
                    </div>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
