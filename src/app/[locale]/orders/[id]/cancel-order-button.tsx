"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { readErrorMessage } from "@/components/home/payment-methods";

/**
 * Cancel an unpaid order, behind an in-page confirmation.
 *
 * Two steps in place rather than `window.confirm`: the browser's dialog cannot
 * be styled, cannot be translated beyond the message string, and is suppressed
 * outright by some embedded browsers — which would turn a "Cancel order"
 * button into one that cancels on the first click. Here the first click only
 * swaps the button for a short question with two answers, and the order is
 * touched only by the second.
 *
 * Only rendered for an `INITIATED` order (see `orderIsEditableByClient`), but
 * the endpoint is the authority: `POST /api/orders/[id]/cancel` re-checks the
 * status and answers 409 if the order was paid in another tab in the
 * meantime. Its `{ error }` is already a sentence in the reader's language and
 * is shown as-is; the fallback covers a body that carries none.
 *
 * On success the page is refreshed rather than navigated away from: the server
 * component re-reads the row, renders the Cancelled pill and drops the actions
 * — the same page now telling the truth about the order, which is better
 * confirmation than any message this component could print.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("orders.orderDetail");
  const tShared = useTranslations("common.shared");
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus follows the swap in both directions, so a keyboard user is never
  // left on a button that has just been unmounted under them.
  const keepRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) {
      keepRef.current?.focus();
    } else if (wasConfirming.current) {
      openRef.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  async function handleConfirm() {
    if (cancelling) {
      return;
    }

    setCancelling(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/cancel`,
        { method: "POST" },
      );

      if (!response.ok) {
        setError(await readErrorMessage(response, t("couldNotCancel")));
        setCancelling(false);
        return;
      }

      // `cancelling` is left set: the refresh re-renders the page without
      // this component, and re-enabling the button first would offer a second
      // cancellation of an order that is already cancelled.
      router.refresh();
    } catch {
      setError(tShared("networkErrorPleaseCheckYourConnection"));
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <div
          role="group"
          aria-labelledby={`cancel-order-${orderId}-title`}
          className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4"
        >
          <p
            id={`cancel-order-${orderId}-title`}
            className="text-sm font-semibold text-paper"
          >
            {t("cancelConfirmTitle")}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {t("cancelConfirmBody")}
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            {/* Red from the palette, as the Cancelled pill is: the landing
                tokens carry no destructive colour, and the accent means
                "selected" on these surfaces. */}
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={cancelling}
              aria-busy={cancelling}
              className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {cancelling ? t("cancelling") : t("confirmCancel")}
            </button>
            <button
              ref={keepRef}
              type="button"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={cancelling}
              className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60"
            >
              {t("keepOrder")}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={openRef}
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-red-500/50 hover:text-red-600"
        >
          {t("cancelOrder")}
        </button>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[13px] leading-snug text-accent"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
