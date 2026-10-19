"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Mode = "system" | "light" | "dark";

const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Sistem teması", light: "Açık tema", dark: "Koyu tema" };
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

// Same rule as the inline script in the root layout: an explicit choice wins, otherwise follow the system.
function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readStored(): Mode {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// The saved choice is read through useSyncExternalStore so the server render ("system") and the
// first client render agree, and the real value follows without an effect.
function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    apply(readStored());
    listener();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", listener);
  };
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readStored, () => "system" as Mode);

  function cycle() {
    const next = NEXT[mode];
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {
      // Storage can be blocked (private window); the choice then lasts for this page only.
    }
    apply(next);
    notify();
  }

  const Icon = ICON[mode];
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11"
      onClick={cycle}
      aria-label={`${LABEL[mode]} (değiştirmek için tıkla)`}
      title={LABEL[mode]}
    >
      <Icon className="size-4" />
    </Button>
  );
}
