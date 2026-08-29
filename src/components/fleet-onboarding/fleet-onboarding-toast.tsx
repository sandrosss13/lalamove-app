"use client";

/** What `showToast` is currently displaying, or `null` for nothing. */
export type FleetToastState = {
  message: string;
  tone: "default" | "error";
} | null;

/**
 * The single toast slot for the fleet onboarding wizard, rendered by
 * `FleetDraftProvider` and fed from its `showToast`. Purely presentational: the
 * provider owns both the message and the dismissal timer, so a step only ever
 * has to call one function.
 *
 * Deliberately its own file rather than a shared component with the driver
 * wizard's toast: the two wizards are separate features, and the only thing
 * genuinely shared between them is the CSS in `globals.css`, which needs no
 * import. The one visible difference is the display window — 2.4s here, per the
 * business design, against the driver flow's 2.2s — and that lives in the
 * provider rather than in this file.
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
      // reduced-motion damping. Re-declared here for exactly that reason.
      data-onboarding-surface=""
      className="animate-onboarding-toast-in fixed bottom-8 left-1/2 z-90 -translate-x-1/2 rounded-[11px] px-[18px] py-3 text-[13.5px] font-medium text-white shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
      style={{
        // Not Tailwind colour utilities: these exact translucent inks are the
        // design's own values and are used nowhere else in the app, so they
        // would be single-use tokens rather than part of a palette.
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
