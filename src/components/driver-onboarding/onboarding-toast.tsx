"use client";

/** What `showToast` is currently displaying, or `null` for nothing. */
export type OnboardingToastState = {
  message: string;
  tone: "default" | "error";
} | null;

/**
 * The single toast slot for the onboarding wizard, rendered by
 * `OnboardingDraftProvider` and fed from its `showToast`. Purely presentational:
 * the provider owns both the message and the dismissal timer, so a step only
 * ever has to call one function ("Fix the highlighted fields to continue." is
 * the copy every step's failed validation raises).
 *
 * Deliberately *not* `src/components/dashboard/ops/ops-toast.tsx`, which is the
 * same mechanism but styled from the `--ops-*` tokens of the dark console. This
 * wizard sits on the app's default light surface, so it gets the design's own
 * fixed bottom-centre treatment instead: `rgba(17,17,19,0.94)`, 11px radius,
 * fade-up 0.2s. Both files stay small; sharing one would mean parameterising a
 * component on a whole palette to save a dozen lines.
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
      // puts it outside the subtree too.
      data-onboarding-surface=""
      className="animate-onboarding-toast-in fixed bottom-8 left-1/2 z-90 -translate-x-1/2 rounded-[11px] px-[18px] py-3 text-[13.5px] font-medium text-white shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
      style={{
        // Not a Tailwind colour utility: this exact translucent ink is the
        // design's own value and is used nowhere else in the app, so it would
        // be a single-use token rather than part of a palette.
        backgroundColor:
          toast.tone === "error"
            ? "rgba(120,20,20,0.96)"
            : "rgba(17,17,19,0.94)",
      }}
    >
      {toast.message}
    </div>
  );
}
