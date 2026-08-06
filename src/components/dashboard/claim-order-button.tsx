"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Company-facing control that takes an open delivery off the market via
 * POST /api/logistics-company/orders/{orderId}/claim.
 *
 * Claiming names no driver and no vehicle — that is the dispatch step, which the
 * card offers next — so this is a bare button with no picker.
 *
 * Loading and error state are surfaced inline (no `alert()`), and a successful
 * claim refreshes the server component so the order moves from the open list to
 * the company's own.
 *
 * `onSuccess` is optional and fires only after a successful claim, so a host
 * that renders this inside a drawer can close it and raise a toast.
 */
export function ClaimOrderButton({
  orderId,
  onSuccess,
}: {
  orderId: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/logistics-company/orders/${orderId}/claim`,
        { method: "POST" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not claim this delivery.");
        return;
      }

      // Server component re-renders with the updated order data.
      router.refresh();
      try {
        onSuccess?.();
      } catch {
        // A bug in the caller's callback must not be reported as this
        // component's own failure: the claim succeeded and the refresh already
        // ran, so surfacing a network error here would be a lie.
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClaim}
        disabled={submitting}
        className="self-start rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Claiming…" : "Claim delivery"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
