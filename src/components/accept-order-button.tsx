"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Driver-facing button that claims a pending delivery via
 * POST /api/orders/{orderId}/accept. Loading and error state are surfaced
 * inline (no `alert()`), and a successful accept refreshes the server component
 * so the order list reflects the new status/assignment.
 */
export function AcceptOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/orders/${orderId}/accept`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not accept this delivery.");
        return;
      }

      // Server component re-renders with the updated order data.
      router.refresh();
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
        onClick={handleAccept}
        disabled={submitting}
        className="self-start rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Accepting…" : "Accept delivery"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
