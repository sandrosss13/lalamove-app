"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * The landing page's light/dark switch: `ThemeToggle` in the landing palette.
 *
 * All of the behaviour — the pre-paint class as the source of truth, the
 * guarded `localStorage` access, the live `prefers-color-scheme` subscription
 * and the CSS-only icon swap — lives in `src/components/theme-toggle.tsx` and is
 * documented there. This file is only a set of class names, kept as its own
 * component so `landing-nav-pill.tsx` (its one caller) keeps importing a name
 * that says where it belongs.
 *
 * The switch used to govern the landing page alone, because `globals.css`
 * scoped both the dark tokens and the `dark:` variant to
 * `[data-landing-page]`. It no longer does: this button now themes the whole
 * app, exactly like the one in the global site header. Nothing about the
 * landing page's own appearance changed with that.
 */
export function LandingThemeToggle({ className }: { className?: string }) {
  return (
    <ThemeToggle
      className={cn(
        // The landing palette, token-only so the control re-tints with the
        // theme it switches. These override the shadcn-token defaults in
        // `ThemeToggle` through `cn()`/twMerge, which resolves by utility group.
        "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-subtle transition-colors hover:bg-surface-raised hover:text-paper",
        // The shared button carries the project's shadcn focus ring
        // (`focus-visible:border-ring focus-visible:ring-3`), but the landing
        // page already draws its own focus outline for every button, once, in
        // the `[data-landing-page] button:focus-visible` rule in `globals.css`.
        // These two cancel the shared ring so focus is not indicated twice —
        // they have to carry the `focus-visible:` modifier themselves, because
        // twMerge keys its conflict groups on the modifier as well as the
        // utility.
        "focus-visible:border-line focus-visible:ring-0",
        className,
      )}
    />
  );
}
