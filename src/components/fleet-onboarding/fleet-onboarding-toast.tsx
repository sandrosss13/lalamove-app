"use client";

/** What `showToast` is currently displaying, or `null` for nothing. */
export type FleetToastState = {
  message: string;
  tone: "default" | "error";
} | null;

/**
 * The pill's surface and ink for each tone. Character-for-character the driver
 * wizard's `TOAST_TONE_CLASS` — the two toasts are deliberate siblings and are
 * meant to be indistinguishable, so this is duplicated rather than extracted
 * for the same reason the two files are separate at all (see the component's
 * doc comment below).
 *
 * These live in classNames rather than the inline `style` prop they used to sit
 * in, and that move is the whole point: an inline style cannot carry a `dark:`
 * variant, so while the two inks were literals on `style.backgroundColor` there
 * was no way to give the dark theme a different pill short of branching in JS
 * on a theme value this component does not have. A lookup keyed by tone also
 * reads better than the nested ternary it replaces, now that a tone maps to
 * several utilities instead of one colour.
 *
 * `default` is `bg-foreground/95` rather than the design's old literal
 * `rgba(17,17,19,0.94)`. In light mode `--foreground` under this surface is
 * `oklch(0.145 0 0)`, i.e. rgb(10,10,10) against the literal's rgb(17,17,19) —
 * the same near-black ink pill with white text, indistinguishable at this size.
 * In dark it inverts for free to a near-white pill with dark text, which is the
 * strongest separation available from the `oklch(0.145)` page (18.9:1) and the
 * reason the pair is worth more than the pixel-exact literal was. The old
 * "single-use tokens, not part of a palette" justification for the literals no
 * longer applies: this is the app's own foreground/background pair, not a new
 * token.
 *
 * `error` keeps the deep maroon in light — `oklch(0.373 0.134 27)` resolves to
 * exactly rgb(120,20,20), the literal it replaces, so light mode does not move
 * — and lightens to a brick red in dark, where the maroon would have been a
 * near-black pill on a near-black page. White text stays on both (11.0:1 light,
 * 6.0:1 dark).
 *
 * The dark lightness is set by the page, not by the text: at `oklch(0.52 …)`
 * the pill clears the `oklch(0.145)` background by 3.3:1, over WCAG 1.4.11's
 * 3:1 floor for a non-text surface. That floor is the binding one here because
 * a toast is transient and has to be findable the instant it appears, so the
 * pill must carry its own separation rather than lean on the ring below to
 * supply it. Going lighter still would buy page contrast at the cost of the
 * white text; this is the balance point.
 */
const TOAST_TONE_CLASS: Record<NonNullable<FleetToastState>["tone"], string> = {
  default: "bg-foreground/95 text-background",
  error:
    "bg-[oklch(0.373_0.134_27)]/95 text-white dark:bg-[oklch(0.52_0.17_25)]/95",
};

/**
 * The single toast slot for the fleet onboarding wizard, rendered by
 * `FleetDraftProvider` and fed from its `showToast`. Purely presentational: the
 * provider owns both the message and the dismissal timer, so a step only ever
 * has to call one function.
 *
 * Deliberately its own file rather than a shared component with the driver
 * wizard's toast: the two wizards are separate features, and the only things
 * genuinely shared between them are the CSS in `globals.css`, which needs no
 * import, and the tone lookup above, which is copied. The one visible
 * difference is the display window — 2.4s here, per the business design,
 * against the driver flow's 2.2s — and that lives in the provider rather than
 * in this file.
 */
export function FleetOnboardingToast({ toast }: { toast: FleetToastState }) {
  if (!toast) return null;

  return (
    // `aria-live` rather than `role="alert"`: a toast that is already on screen
    // when a second one replaces it should be announced politely, not
    // interrupt. Errors get the assertive channel.
    <div
      role="status"
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      // The toast is a sibling of the wizard's `<main>`, not a child of it, so
      // it sits outside that element's `data-onboarding-surface` subtree and
      // would otherwise miss both the wizard's token resolution and its
      // reduced-motion damping. Re-declared here for exactly that reason. That
      // token resolution is now load bearing rather than incidental: without it
      // `bg-foreground/95` below would read the page's own foreground instead
      // of this surface's.
      data-onboarding-surface=""
      // The ring is the drop shadow's understudy. A `0_12px_32px_rgba(0,0,0,…)`
      // shadow only reads as lift against a light page; on the dark one it
      // paints black on near-black and disappears, leaving the pill flat. A
      // hairline edge — dark over a light page, light over a dark one — gives
      // the pill a boundary in both themes, and the shadow is kept because it
      // is still doing its job in light.
      className={`animate-onboarding-toast-in fixed bottom-8 left-1/2 z-90 -translate-x-1/2 rounded-[11px] px-[18px] py-3 text-[13.5px] font-medium ring-1 shadow-[0_12px_32px_rgba(0,0,0,0.25)] ring-black/10 dark:ring-white/15 ${TOAST_TONE_CLASS[toast.tone]}`}
    >
      {toast.message}
    </div>
  );
}
