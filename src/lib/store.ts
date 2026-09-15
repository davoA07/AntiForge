"use client";

import { get, set } from "idb-keyval";
import { useCallback, useEffect, useState } from "react";
import type { Signature } from "@/lib/engine";

export interface Identity {
  id: string;
  name: string;
  createdAt: number;
  references: Signature[];
}

interface ExportFile {
  app: "antiforge";
  version: 1;
  exportedAt: string;
  identities: Identity[];
}

const KEY = "antiforge.identities.v1";

let cache: Identity[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export async function loadIdentities(): Promise<Identity[]> {
  if (cache) return cache;
  try {
    const stored = await get<Identity[]>(KEY);
    cache = Array.isArray(stored) ? stored : [];
  } catch {
    cache = [];
  }
  return cache;
}

export async function saveIdentities(list: Identity[]): Promise<void> {
  cache = list;
  notify();
  await set(KEY, list);
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Serialise identities for download. */
export function exportIdentities(identities: Identity[]): string {
  const file: ExportFile = {
    app: "antiforge",
    version: 1,
    exportedAt: new Date().toISOString(),
    identities,
  };
  return JSON.stringify(file);
}

/** Parse and validate an export file. Throws with a readable message. */
export function parseIdentities(json: string): Identity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const file = parsed as Partial<ExportFile>;
  if (file?.app !== "antiforge" || !Array.isArray(file.identities)) {
    throw new Error("That file was not exported by AntiForge.");
  }
  return file.identities.map((raw, index) => {
    const id = raw as Partial<Identity>;
    if (typeof id.name !== "string" || !Array.isArray(id.references)) {
      throw new Error(`Identity #${index + 1} is malformed.`);
    }
    for (const sig of id.references) {
      if (!Array.isArray(sig?.strokes)) {
        throw new Error(`Identity "${id.name}" has a malformed signature.`);
      }
    }
    return {
      id: typeof id.id === "string" ? id.id : newId(),
      name: id.name,
      createdAt: typeof id.createdAt === "number" ? id.createdAt : Date.now(),
      references: id.references,
    };
  });
}

/** React binding over the IndexedDB-backed identity list. */
export function useIdentities() {
  const [identities, setIdentities] = useState<Identity[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let live = true;
    const sync = () => {
      if (live && cache) setIdentities(cache);
    };
    listeners.add(sync);
    loadIdentities().then(() => {
      if (!live) return;
      sync();
      setLoading(false);
    });
    return () => {
      live = false;
      listeners.delete(sync);
    };
  }, []);

  const add = useCallback(async (name: string, references: Signature[]) => {
    const list = await loadIdentities();
    const identity: Identity = { id: newId(), name, createdAt: Date.now(), references };
    await saveIdentities([identity, ...list]);
    return identity;
  }, []);

  const remove = useCallback(async (id: string) => {
    const list = await loadIdentities();
    await saveIdentities(list.filter((i) => i.id !== id));
  }, []);

  const replace = useCallback(async (list: Identity[]) => {
    await saveIdentities(list);
  }, []);

  const merge = useCallback(async (incoming: Identity[]) => {
    const list = await loadIdentities();
    const known = new Set(list.map((i) => i.id));
    const fresh = incoming.filter((i) => !known.has(i.id));
    await saveIdentities([...fresh, ...list]);
    return fresh.length;
  }, []);

  return { identities, loading, add, remove, replace, merge };
}
