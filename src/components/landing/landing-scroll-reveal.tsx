"use client";

import { useEffect } from "react";

/**
 * The observer's own settings, from the design handoff's "Scroll reveal"
 * section. `threshold` is deliberately tiny — a tall section only ever has a
 * sliver on screen when it first crosses the fold — and the negative bottom
 * `rootMargin` holds the reveal back until the element is properly in view
 * rather than firing on its first pixel.
 */
const REVEAL_THRESHOLD = 0.08;
const REVEAL_ROOT_MARGIN = "0px 0px -6% 0px";

/**
 * How far down the viewport counts as "already on screen".
 *
 * Anything above this line is shown immediately and never observed, which is
 * the rule that keeps the hero — above the fold on every viewport — from being
 * hidden for even one frame. An earlier prototype of this design blanked the
 * hero for three and a half seconds; this check is what prevents that.
 */
const ALREADY_VISIBLE_VIEWPORT_RATIO = 0.95;

/**
 * How long to wait for the observer's first callback before giving up.
 *
 * IntersectionObserver reports on every observed target shortly after
 * `observe()`, intersecting or not, so a single callback is proof it works. If
 * none has arrived by now the page must not be left with invisible content, so
 * the hidden state is lifted wholesale. It is explicitly *not* an unconditional
 * "reveal everything on a timer": that would defeat the effect on every normal
 * page load.
 */
const OBSERVER_SAFETY_TIMEOUT_MS = 1200;

/** Set on the page root, by script only. See the CSS note below. */
const READY_ATTRIBUTE = "data-reveal-ready";

/** Set per element once it has entered view (or was in view when it mounted). */
const SHOWN_ATTRIBUTE = "data-reveal-shown";

const REVEAL_SELECTOR = "[data-reveal]";

/**
 * Installs the page-wide `[data-reveal]` scroll animation and renders nothing.
 *
 * It is its own component because `landing-page.tsx` is a server component (it
 * is rendered directly from `/home`, and through a client boundary from `/`),
 * so the effect cannot live there.
 *
 * The hidden state lives in CSS but is **gated on `data-reveal-ready`, which
 * only this component sets** — see the matching rule in `globals.css`. Shipping
 * `[data-reveal] { opacity: 0 }` unconditionally would blank the page for a
 * visitor with JavaScript off and for any crawler that does not run scripts,
 * and `/` is the site's front door and its SEO surface. That single attribute
 * is also the whole of the escape hatch: removing it from the root reveals
 * every element at once, which is what the failure paths below do.
 *
 * Visibility is driven by attributes, never by inline styles: the transition
 * itself belongs to the stylesheet. The handoff's prototype paints imperatively
 * only because its preview renderer cannot run CSS transitions, and calls that
 * out as a compromise not to carry over.
 */
export function LandingScrollReveal() {
  useEffect(() => {
    /*
      Under reduced motion nothing is hidden and nothing is observed — the
      component is a no-op. Leaving it to the reduced-motion block in
      `globals.css` would not do: that block forces
      `transition-duration: 0.01ms !important` inside `[data-landing-page]`,
      which makes the transition instant but leaves the element at `opacity: 0`
      until the observer fires. Hiding nothing is the correct behaviour here,
      not hiding it faster.
    */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const root = document.querySelector<HTMLElement>("[data-landing-page]");
    if (!root) {
      return;
    }

    // Without the API there is nothing to reveal *on*, so the page is left
    // exactly as it server-rendered: complete, and never marked ready.
    if (typeof IntersectionObserver !== "function") {
      return;
    }

    /**
     * Whether an element is close enough to the fold to be shown without ever
     * being hidden. Measured against a layout in which nothing is hidden yet,
     * which is why the first pass below runs before the root is marked ready.
     */
    function isOnScreen(element: Element) {
      return (
        element.getBoundingClientRect().top <
        window.innerHeight * ALREADY_VISIBLE_VIEWPORT_RATIO
      );
    }

    let hasObserverReported = false;

    const observer = new IntersectionObserver(
      (entries) => {
        hasObserverReported = true;

        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          entry.target.setAttribute(SHOWN_ATTRIBUTE, "");
          // One-shot: scrolling back up must not re-hide a revealed section.
          observer.unobserve(entry.target);
        }
      },
      { threshold: REVEAL_THRESHOLD, rootMargin: REVEAL_ROOT_MARGIN },
    );

    /** Show it now if it is on screen; otherwise wait for it to scroll in. */
    function track(element: Element) {
      if (element.hasAttribute(SHOWN_ATTRIBUTE)) {
        return;
      }

      if (isOnScreen(element)) {
        element.setAttribute(SHOWN_ATTRIBUTE, "");
        return;
      }

      observer.observe(element);
    }

    for (const element of root.querySelectorAll(REVEAL_SELECTOR)) {
      track(element);
    }

    // Only now does anything become hidden, and only what is below the fold.
    root.setAttribute(READY_ATTRIBUTE, "");

    /*
      Sections that mount after this effect runs — the vehicle catalogue fetches
      its types from `/api/vehicle-types` and renders its cards only once that
      resolves — were not in the first pass, so nothing would ever observe them
      and the CSS above would hide them permanently. Watching the subtree is
      what makes the mechanism a page-wide guarantee rather than a promise that
      only holds for markup present at hydration.
    */
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches(REVEAL_SELECTOR)) {
            track(node);
          }

          for (const nested of node.querySelectorAll(REVEAL_SELECTOR)) {
            track(nested);
          }
        }
      }
    });

    mutationObserver.observe(root, { childList: true, subtree: true });

    const safetyTimeout = window.setTimeout(() => {
      if (hasObserverReported) {
        return;
      }

      // Lifting the gate rather than marking each element shown: it reveals
      // whatever is on the page now *and* whatever mounts later, which is the
      // point of giving up.
      root.removeAttribute(READY_ATTRIBUTE);
      observer.disconnect();
      mutationObserver.disconnect();
    }, OBSERVER_SAFETY_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.clearTimeout(safetyTimeout);
    };
  }, []);

  return null;
}
