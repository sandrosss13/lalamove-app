"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/**
 * The applied theme, for the handful of components that cannot express
 * themselves in CSS and so have to branch on it in JavaScript.
 *
 * Today that is exactly the two Google Maps canvases
 * (`src/components/home/route-preview-map.tsx`,
 * `src/components/order-tracking-map.tsx`). A map is painted by the Maps SDK
 * into its own canvas from a `MapTypeStyle[]` handed over in JS, so no `dark:`
 * utility can reach it — the style array itself has to be chosen. Anything that
 * CAN be written as a `dark:` class should be: this hook costs a subscription
 * and a re-render, a CSS variant costs neither.
 *
 * ## The contract, which is `src/components/theme-toggle.tsx`'s
 *
 * **The `dark` class on `<html>` is the source of truth, and this hook only
 * reads it.** The class is put there before first paint by the inline script in
 * `src/app/layout.tsx`, which resolves the stored `"theme"` choice — or, with no
 * stored choice, the OS preference — into that one class. Every other themed
 * thing in the app keys off the same class through the `dark:` variant, so
 * reading it is what keeps a map in step with the page around it rather than
 * merely near it.
 *
 * Deliberately NOT duplicated here:
 *
 * - **Reading `localStorage`.** The stored value is an *input* to the class, not
 *   a parallel answer to "what theme is showing". Consulting it directly would
 *   invent a second source of truth that disagrees with the page during the one
 *   moment it matters — a visitor with no stored choice.
 * - **Subscribing to `prefers-color-scheme`.** `ThemeToggle` already does that,
 *   and follows the OS live until the visitor makes an explicit choice, by
 *   flipping the class — which arrives here through the observer below. Adding a
 *   second subscription that also wrote the class would mean two owners for one
 *   piece of global state; one that merely re-read it would be a no-op, since
 *   nothing else changes the class. On a surface with no `ThemeToggle` mounted
 *   an OS change moves nothing, and the map correctly holds still along with
 *   every `dark:` utility on the page.
 *
 * So: one observer, watching the one attribute that decides the whole app's
 * theme. A click on the toggle mutates `class`, the observer fires, and the maps
 * re-style without a reload.
 */

/**
 * `MutationObserver` rather than a React context or an event: the class is
 * mutated by two plain DOM writers — the pre-paint script, which runs before
 * React exists, and `ThemeToggle`'s click handler — and neither can be asked to
 * publish to a store without making this hook's consumers its dependency.
 * Observing the attribute picks up both, plus anything that flips the class in
 * future (devtools, an E2E test, a third writer), with no coordination at all.
 *
 * One observer is shared by every subscriber and torn down when the last one
 * leaves, so N maps on a page cost one observer, not N.
 */
let observer: MutationObserver | null = null;
const subscribers = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);

  if (!observer) {
    observer = new MutationObserver(() => {
      for (const notify of subscribers) {
        notify();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * The server snapshot, and therefore also React's value for the first client
 * render. Pinned to `"light"` for the reason `src/app/layout.tsx` documents at
 * length: the server cannot know a visitor's theme, `src/app/page.tsx` is
 * `revalidate = 60` and its HTML is shared between visitors, so any
 * theme-dependent markup would be wrong for half of them. `ThemeToggle` starts
 * from the same stable `"light"` and corrects itself after mount.
 *
 * For a map this costs nothing visible: the SDK is still loading its tiles when
 * the correction lands, and a style change is a `setOptions` call, not a remount.
 */
function getServerSnapshot(): Theme {
  return "light";
}

/**
 * Subscribes to the applied theme. Returns `"light"` on the server and for the
 * first client render, then the real value.
 *
 * Client components only — it reads `document`. Anything calling it needs a
 * `"use client"` boundary above it.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
