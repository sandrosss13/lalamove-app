"use client";

import type { OpsToastState } from "@/components/dashboard/ops/ops-dashboard-context";

/**
 * The single toast slot for the whole dashboard, rendered by the shell and fed
 * from `showToast`. Purely presentational: the shell owns both the message and
 * the dismissal timer, so mutation flows only have to call one function.
 */
export function OpsToast({ toast }: { toast: OpsToastState }) {
  if (!toast) return null;

  return (
    <div
      className={`animate-ops-toast-in fixed right-6 bottom-6 z-50 rounded-xl border px-4.5 py-3 text-sm ${
        toast.tone === "error"
          ? "border-ops-danger/40 bg-ops-surface-raised text-ops-danger"
          : "border-ops-border bg-ops-surface-raised text-ops-text"
      }`}
    >
      {toast.message}
    </div>
  );
}
