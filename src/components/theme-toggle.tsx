"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Restated rather than imported from `src/app/layout.tsx`: the pre-paint script
 * there has to embed this key in a string literal that runs before any module
 * loads, so there is no shared constant to import. Both sides are commented to
 * point at each other — the same deliberate-restatement convention the admin
 * routes use for their `ALLOWED_ROLES`. Change one, change the other.
 */
const THEME_STORAGE_KEY = "theme";

type Theme = "light" | "dark";

/**
 * The applied theme is read back off the DOM rather than kept as the source of
 * truth in React state: the pre-paint script in `src/app/layout.tsx` is what
 * sets the class, so the class *is* the truth and state only mirrors it.
 *
 * This also means several `ThemeToggle`s can be mounted at once — the global
 * site header's and a surface's own — without any shared store between them.
 * Each one re-reads the class on click, so they can never disagree about what
 * "the current theme" is, only about `aria-pressed` for the frame before their
 * effects run.
 */
function readAppliedTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Reads the persisted choice, if any. `localStorage` *throws* rather than
 * returning null when site data is blocked or in some private-browsing modes,
 * so every access is guarded; a blocked store simply reads as "no choice yet",
 * which lands the visitor on their OS preference.
 */
function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

/** Sun — shown in dark mode, because the button switches *to* light. */
function SunGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="hidden h-4 w-4 dark:block"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** Moon — shown in light mode, because the button switches *to* dark. */
function MoonGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 dark:hidden"
    >
      <path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4z" />
    </svg>
  );
}

/**
 * The surface-agnostic default look: a 9×9 round icon button drawn entirely
 * from shadcn tokens, so it re-tints with whatever surface it lands on and with
 * the theme it switches.
 *
 * `hover:bg-secondary` rather than the `hover:bg-accent` a stock shadcn icon
 * button would use. `accent` is the one shadcn colour name this project cannot
 * use neutrally: `globals.css` resolves it as
 * `var(--admin-accent, var(--landing-accent))`, and `--admin-accent` only
 * exists inside `[data-admin-surface]` / `[data-onboarding-surface]`. Anywhere
 * else — including the global site header this toggle's first home is —
 * `bg-accent` means the landing palette's brand orange, so the stock class
 * would give the button a bright orange hover disc. `secondary` has no such
 * collision: `--color-secondary` maps straight to `--secondary`, which is
 * neutral in both themes.
 *
 * The focus treatment is the project's shadcn convention, copied from
 * `buttonVariants` in `src/components/ui/button.tsx` rather than invented here.
 */
const THEME_TOGGLE_DEFAULT_CLASSES =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-secondary-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The app's light/dark switch. One implementation, mounted wherever a surface
 * wants one: the global site header in `src/app/layout.tsx`, and each surface's
 * own header for the surfaces that hide that one (the admin back office, the
 * driver hub, the onboarding wizards, the auth shell, the landing page).
 *
 * It toggles `dark` on `<html>`, which `globals.css` turns into a whole-app
 * theme — the shadcn token set, the `--landing-*` palette and the `dark:`
 * variant all key off that one class. Because the class is global, every mounted
 * instance drives the same thing and none of them need to know about the others.
 *
 * The hydration problem — the server cannot know the visitor's theme, so any
 * markup derived from it mismatches — is solved twice over:
 *
 * 1. Visuals come from CSS, not state. Both glyphs are always in the DOM and
 *    `dark:` utilities decide which is visible. The class is already on `<html>`
 *    before paint, so the correct icon is the only one that ever renders and the
 *    server markup is byte-identical in both themes. Do not "simplify" this to
 *    rendering one glyph off `theme` state: that reintroduces the mismatch and
 *    guarantees a wrong-icon flash on every load.
 * 2. ARIA settles after mount. `aria-pressed` starts at a stable `false` on both
 *    server and first client render, then an effect corrects it. One frame of
 *    stale ARIA beats `aria-pressed={undefined}`, which is invalid on a toggle.
 *
 * @param className merged over the default look with `cn()`, so a surface can
 *   restyle the button to its own palette. twMerge resolves the conflicts, which
 *   means a caller overriding a `focus-visible:` treatment has to pass classes
 *   carrying that same modifier — see `landing-theme-toggle.tsx` for the one
 *   caller that does.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Starts at the light default on both the server and the first client render
  // so hydration matches, then syncs to whatever the pre-paint script actually
  // applied. Only `aria-pressed` depends on this; the icons are swapped by CSS,
  // so nothing visible waits for the effect.
  const [theme, setTheme] = useState<Theme>("light");

  // Whether the visitor has picked a theme, either in an earlier session (read
  // from storage) or by clicking just now. A ref rather than state because the
  // OS-preference subscription below reads it from inside a listener and must
  // not be torn down and re-attached when it flips — and because a click has to
  // stop the page following the OS even when the write to `localStorage` threw,
  // which is the one case storage cannot answer for itself.
  const hasExplicitChoiceRef = useRef(false);

  useEffect(() => {
    setTheme(readAppliedTheme());
    hasExplicitChoiceRef.current = readStoredTheme() !== null;

    // Until the visitor chooses, the page follows the OS live — the same rule
    // the pre-paint script applies on load, extended to a preference that
    // changes while the tab is open (macOS/Windows auto dark at sunset).
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemChange(event: MediaQueryListEvent) {
      if (hasExplicitChoiceRef.current) return;
      document.documentElement.classList.toggle("dark", event.matches);
      setTheme(event.matches ? "dark" : "light");
    }

    query.addEventListener("change", handleSystemChange);
    return () => query.removeEventListener("change", handleSystemChange);
  }, []);

  function handleClick() {
    const next: Theme = readAppliedTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");

    // Set before the write, so it holds even if persisting throws: an explicit
    // click must stop the OS listener overriding the visitor for this page view.
    hasExplicitChoiceRef.current = true;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Site data blocked, or private browsing. The switch still works for this
      // page view; it just will not be remembered. Never let this throw — an
      // unhandled error here would leave the class flipped and the UI wedged.
    }

    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={theme === "dark"}
      aria-label="Dark theme"
      className={cn(THEME_TOGGLE_DEFAULT_CLASSES, className)}
    >
      {/*
        Both glyphs are always rendered and swapped by CSS, so the server markup
        does not depend on the theme. `aria-hidden` on both: the button's own
        label already names the control.
      */}
      <MoonGlyph />
      <SunGlyph />
      <span className="sr-only">Dark theme</span>
    </button>
  );
}
