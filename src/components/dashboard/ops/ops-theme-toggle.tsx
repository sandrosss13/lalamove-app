"use client";

import { Moon, Sun } from "lucide-react";

import type { OpsTheme } from "@/components/dashboard/ops/use-ops-theme";

/**
 * Topbar icon button that flips the console between its dark (default) and
 * light palettes. Purely presentational — theme state lives in `useOpsTheme`,
 * owned by the shell that renders this.
 */
export function OpsThemeToggle({
  theme,
  onToggle,
}: {
  theme: OpsTheme;
  onToggle: () => void;
}) {
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-ops-border text-ops-text-muted hover:bg-ops-surface-raised hover:text-ops-text"
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
