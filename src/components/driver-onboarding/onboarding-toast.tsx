"use client";

/** What `showToast` is currently displaying, or `null` for nothing. */
export type OnboardingToastState = {
  message: string;
  tone: "default" | "error";
} | null;

/**
 * The pill's surface and ink for each tone.
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
 * "single-use token, not part of a palette" justification for the literal no
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
const TOAST_TONE_CLASS: Record<
  NonNullable<OnboardingToastState>["tone"],
  string
> = {
  default: "bg-foreground/95 text-background",
  error:
    "bg-[oklch(0.373_0.134_27)]/95 text-white dark:bg-[oklch(0.52_0.17_25)]/95",
};

/**
 * The single toast slot for the onboarding wizard, rendered by
 * `OnboardingDraftProvider` and fed from its `showToast`. Purely presentational:
 * the provider owns both the message and the dismissal timer, so a step only
 * ever has to call one function ("Fix the highlighted fields to continue." is
 * the copy every step's failed validation raises).
 *
 * Deliberately never shared with the retired ops console's own toast, which was
 * the same mechanism styled from that console's dark palette. This one keeps
 * the design's own fixed bottom-centre treatment — 11px radius, fade-up 0.2s —
 * and takes its two inks from the theme instead, so it follows the app into
 * dark mode rather than pinning one palette the way the console did. Keeping
 * them separate is what let the console be deleted without touching this file.
 */
export function OnboardingToast({ toast }: { toast: OnboardingToastState }) {
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
      // reduced-motion damping. Marked as its own surface for the same reason
      // `DialogContent` is in `document-upload-dialog.tsx`, whose Radix portal
      // puts it outside the subtree too. That token resolution is now load
      // bearing rather than incidental: without it `bg-foreground/95` below
      // would read the page's own foreground instead of this surface's.
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
