"use client";

import { useLayoutEffect } from "react";

/**
 * Re-applies the theme class after a client-side locale switch.
 *
 * `<html>` is rendered by `src/app/[locale]/layout.tsx`, so changing the locale
 * remounts that layout, and React 19 strips every attribute off the `<html>`
 * singleton when it is released — including the `dark` class the pre-paint
 * script added. That script is an inline `<script>` and never re-runs on a soft
 * navigation, so without this the page silently fell back to light on every
 * language change.
 *
 * Mounted inside the same layout, so it remounts with it; `useLayoutEffect`
 * runs before the browser paints, so there is no flash of the wrong theme.
 * The resolution rule is the pre-paint script's (`THEME_SCRIPT`): an explicit
 * stored choice wins, otherwise follow the OS. The `"theme"` key is restated
 * there and in `src/components/theme-toggle.tsx` — change all three together.
 */
export function ThemeRestore() {
  useLayoutEffect(() => {
    let dark: boolean;
    try {
      const stored = window.localStorage.getItem("theme");
      dark =
        stored === "dark" ||
        (stored !== "light" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return null;
}
