"use client";

import { useSyncExternalStore } from "react";

// Documents the uploader is processing right now in this tab. The file list reads it so it does not
// offer "Devam et" for a file that is already being worked on.
const active = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export function markIngesting(id: string, on: boolean) {
  if (on) active.add(id);
  else active.delete(id);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsIngesting(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => active.has(id),
    () => false,
  );
}
