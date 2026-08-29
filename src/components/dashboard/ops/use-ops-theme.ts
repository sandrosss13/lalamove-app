"use client";

import { useCallback, useEffect, useState } from "react";

export type OpsTheme = "dark" | "light";

const STORAGE_KEY = "ops-dashboard-theme";

/**
 * The ops console's dark/light preference. Dark is the default — it's the
 * console's original fixed palette — and renders on first paint even on the
 * server; a visitor's override is read from localStorage in an effect (so
 * there's no SSR/client markup mismatch) and persists per-browser, shared by
 * the company and driver consoles since they're the same storage key.
 */
export function useOpsTheme(): { theme: OpsTheme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<OpsTheme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: OpsTheme = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
