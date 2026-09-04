"use client";

import { useId, useState } from "react";
import type * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check } from "lucide-react";

import {
  AddCardDialog,
  type NewCardInput,
} from "@/components/home/add-card-dialog";
import {
  PICK_CARD_IDLE_CLASSES,
  PICK_CARD_SELECTED_CLASSES,
} from "@/components/home/booking-form-primitives";
import {
  CARD_BRAND_CHIP_BASE_CLASSES,
  cardBrandChipClasses,
  cardBrandChipLabel,
} from "@/components/home/card-brand";
import {
  PAY_LATER_OPTION_VALUE,
  formatCardExpiry,
  maskedCardNumber,
  readErrorMessage,
  type BookingPaymentOptions,
  type SavedCardSummary,
} from "@/components/home/payment-methods";
import { formatGel } from "@/components/orders-format";
import { Label } from "@/components/ui/label";

/**
 * The payment half of the checkout page: the method the client settles with,
 * and the button that settles it.
 *
 * This is the booking form's old step 7, moved. Everything about *what* it may
 * offer is still the server's answer, handed down as props from
 * `loadBookingPaymentOptions` — which methods admin has switched on, the
 * client's saved cards, and whether the client is a business — because none of
 * the three is a decision a browser is in a position to make. The BUSINESS-only
 * purchase-order field in particular is never rendered for an individual
 * client, which is a different guarantee from rendering it and hiding it.
 *
 * **No payment gateway exists and none has been chosen.** Pressing Pay records
 * an intention and puts the order on the open market; it moves no money. Saved
 * cards are display metadata (brand, last four, expiry) and the PAN never
 * reaches this server at all — see `add-card-dialog.tsx`.
 *
 * Colour rule: landing token utilities only (`bg-ink`, `bg-surface`,
 * `text-paper`, `text-muted`, `border-line`, the accent) — never a hex literal
 * and never a `dark:` variant, which cannot match on this page because it
 * carries no `data-landing-page` (see `globals.css`'s `@custom-variant dark`).
 * The brand chip's palette utilities are the one deliberate exception the
 * codebase already makes, and they live in `card-brand.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How the client said they will settle.
 *
 * `savedCardId` is present on both arms rather than only on the card one, so the
 * submit reads one field instead of narrowing a union — and `null` on the Pay
 * later arm is exactly what the pay endpoint requires: it refuses a card id sent
 * alongside anything but `CARD`.
 *
 * There is no `PAY_LATER` method. Pay later *is* `CASH`, under the label the
 * client is shown — see `PaymentMethod` in `payment-methods.ts` for why a fourth
 * enum value would be the wrong way to say it.
 */
type PaymentChoice =
  | { method: "CARD"; savedCardId: string }
  | { method: "CASH"; savedCardId: null };

export type CheckoutPaymentPanelProps = BookingPaymentOptions & {
  orderId: string;
  /**
   * What the client owes, in GEL — `price + serviceLevelAdjustment`, computed by
   * the page from the persisted order row. Named on the Pay button so the figure
   * on the control matches the total in the breakdown beside it. The server
   * recomputes it from the same columns when it writes the `Payment` row; this
   * copy is display only and is never sent.
   */
  totalGel: number;
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One row of the method list: the pick-card border and fill states laid out
 * horizontally — chip, then title and note, then the tick — plus the pointer
 * affordance and the focus ring a `<label>` wrapping an `sr-only` radio has to
 * draw on the hidden input's behalf.
 */
const PAYMENT_OPTION_CLASSES =
  "flex cursor-pointer items-center gap-3.5 rounded-xl border p-[14px_16px] transition-colors has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20";

/** The dashed full-width control that opens the add-card dialog. */
const ADD_CARD_BUTTON_CLASSES =
  "mt-3 w-full rounded-lg border border-dashed border-line px-4 py-[11px] text-sm font-medium text-paper transition-colors hover:border-accent hover:text-accent";

/** The purchase-order field, matching the add-card dialog's own inputs. */
const PURCHASE_ORDER_FIELD_CLASSES =
  "h-12 w-full rounded-lg border border-line bg-ink px-3.5 text-sm text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

/**
 * The primary action. Grey fill and a not-allowed cursor while disabled rather
 * than a fade, matching `add-card-dialog.tsx`'s save button:
 * `disabled:pointer-events-auto` is what lets the cursor show at all on a
 * disabled button.
 */
const PAY_BUTTON_CLASSES =
  "mt-5 h-12 w-full rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:opacity-100";

/**
 * Longest purchase-order reference the field accepts, mirroring the cap
 * `POST /api/orders/[id]/pay` applies to the same value. Held here so an
 * over-long reference is stopped at the keyboard rather than sent and bounced —
 * the server stays the authority either way.
 */
const PURCHASE_ORDER_REF_MAX_LENGTH = 200;

/** Shown when a rejected card save carries no message of its own. */
const SAVE_CARD_FAILED_MESSAGE = "Could not save the card. Try again.";

/** Shown when a rejected payment carries no message of its own. */
const PAY_FAILED_MESSAGE = "Could not complete the payment. Try again.";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The accent tick marking the chosen row. Sits in flow and is pushed right by
 * `ml-auto`, unlike the shared `SelectedTick`, which is absolutely positioned
 * for the corner of a vertical pick card.
 */
function PaymentSelectedTick(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-ink"
    >
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  );
}

/**
 * The client's default card as a payment choice, or `null` when there is nothing
 * to pre-select — no card of theirs is the default, or admin has the card method
 * switched off, in which case no card row is rendered at all.
 *
 * Never falls back to Pay later. Unlike the booking form's optional step, this
 * page cannot proceed without a choice — but pre-selecting a settlement method
 * the client did not pick would be worse than asking, because the button beside
 * it commits to it.
 */
function defaultPaymentChoice(
  cards: SavedCardSummary[],
  cardPaymentEnabled: boolean,
): PaymentChoice | null {
  if (!cardPaymentEnabled) {
    return null;
  }

  const preferred = cards.find((card) => card.isDefault);

  return preferred ? { method: "CARD", savedCardId: preferred.id } : null;
}

/**
 * `cards` with a newly saved one folded in, in the order the server would have
 * returned them: the default first, then newest first.
 *
 * The demotion is not cosmetic. `POST /api/saved-cards` promotes the new card in
 * the same transaction whenever the client asked for it — or whenever it is
 * their first — so a list that kept the old default's flag would print two
 * "Default" notes for a client who has one.
 */
function withSavedCard(
  cards: SavedCardSummary[],
  saved: SavedCardSummary,
): SavedCardSummary[] {
  const existing = saved.isDefault
    ? cards.map((card) => ({ ...card, isDefault: false }))
    : cards;

  // `filter` preserves order, so the non-default tail keeps its newest-first
  // sort with the new card at its head.
  const next = [saved, ...existing];

  return [
    ...next.filter((card) => card.isDefault),
    ...next.filter((card) => !card.isDefault),
  ];
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function CheckoutPaymentPanel({
  orderId,
  totalGel,
  enabledPaymentMethods,
  savedCards,
  accountType,
}: CheckoutPaymentPanelProps): React.ReactElement {
  const router = useRouter();

  // Not an element id but a shared radio `name`: it is what binds the rows into
  // one group for the browser's own arrow-key handling and its "2 of 3"
  // announcement.
  const paymentMethodName = useId();
  const headingId = useId();
  const purchaseOrderRefId = useId();
  const purchaseOrderNoteId = `${purchaseOrderRefId}-note`;
  const payHintId = useId();

  /**
   * Which methods this panel may offer, read from the prop rather than assumed:
   * `PaymentMethodConfig` is admin's switchboard, and the pay endpoint refuses a
   * method whose row is disabled or missing.
   *
   * `BANK_TRANSFER` has no row of its own here, for the same reason the booking
   * form gave it none: checkout is a card-or-later choice, and the endpoint's
   * own register refuses anything else.
   */
  const cardPaymentEnabled = enabledPaymentMethods.includes("CARD");
  const payLaterEnabled = enabledPaymentMethods.includes("CASH");
  const anyMethodEnabled = cardPaymentEnabled || payLaterEnabled;

  // The account type is the server's answer, never a guess made here: it is read
  // from the client's own `ClientProfile` by `loadBookingPaymentOptions`. An
  // individual client is never sent the purchase-order field at all.
  const isBusinessClient = accountType === "BUSINESS";

  const [cards, setCards] = useState<SavedCardSummary[]>(savedCards);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice | null>(() =>
    defaultPaymentChoice(savedCards, cardPaymentEnabled),
  );
  const [purchaseOrderRef, setPurchaseOrderRef] = useState("");
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Save a card typed into the add-card dialog, then select it.
   *
   * Receives display metadata only — brand, last four, expiry, holder name and
   * the default flag. The card number and the security code never leave the
   * dialog, and `POST /api/saved-cards` refuses outright any body carrying
   * either, so there is nothing here to send even by accident.
   *
   * Throwing is how the dialog is told: it catches, renders the message inline
   * under its own fields and stays open. Resolving is what closes it.
   */
  async function handleAddCard(card: NewCardInput) {
    const response = await fetch("/api/saved-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, SAVE_CARD_FAILED_MESSAGE),
      );
    }

    const payload = (await response.json()) as { card?: SavedCardSummary };
    const saved = payload.card;

    if (!saved) {
      throw new Error(SAVE_CARD_FAILED_MESSAGE);
    }

    setCards((current) => withSavedCard(current, saved));
    // Adding a card at the moment of paying is a choice of that card; making the
    // client pick it again would be asking twice.
    setPaymentChoice({ method: "CARD", savedCardId: saved.id });
    router.refresh();
  }

  /**
   * Settle the order and move on.
   *
   * Everything sent here is re-derived and re-checked server-side — the method
   * against admin's switchboard, the card against this client's own wallet, the
   * purchase-order reference against their account type, and the amount against
   * the persisted order row. Nothing this component holds is trusted, the total
   * least of all: it is never sent.
   *
   * `paying` is deliberately left `true` on success. The navigation that follows
   * is asynchronous, and re-enabling the button in the gap would put a live "Pay"
   * control in front of a client whose order is already paid — the endpoint
   * would refuse the second press, but showing it at all is the wrong answer.
   */
  async function handlePay() {
    if (!paymentChoice || paying) {
      return;
    }

    setPaying(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodType: paymentChoice.method,
          // Omitted rather than sent as `null` on the Pay later arm: the
          // endpoint refuses a card id alongside anything but `CARD`.
          savedCardId: paymentChoice.savedCardId ?? undefined,
          // Only ever sent by a business client. An individual's panel never
          // renders the field, so this can only be the empty string there.
          purchaseOrderRef: isBusinessClient
            ? purchaseOrderRef.trim() || undefined
            : undefined,
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, PAY_FAILED_MESSAGE));
        setPaying(false);
        return;
      }

      router.push(`/checkout/${orderId}/success`);
    } catch {
      // A thrown fetch is the network being unavailable, not the server saying
      // no — there is no `{ error }` body to read a reason out of.
      setError(PAY_FAILED_MESSAGE);
      setPaying(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2
        id={headingId}
        className="font-display text-base font-semibold text-paper"
      >
        Payment method
      </h2>
      <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
        Choose how you would like to settle this delivery.
      </p>

      {anyMethodEnabled ? (
        <>
          {/* Native radios, for the reasons every picker on the booking form
              uses them: the group's arrow-key navigation and its "2 of 3"
              announcement both come free with the real inputs. */}
          <fieldset className="mt-4">
            {/* The heading above is this group's visible name, and assistive
                tech has no way to associate the two — so the legend says it
                again rather than leaving the group unnamed. */}
            <legend className="sr-only">Payment method</legend>

            <div className="flex flex-col gap-2.5">
              {cardPaymentEnabled
                ? cards.map((card) => {
                    const selected =
                      paymentChoice?.method === "CARD" &&
                      paymentChoice.savedCardId === card.id;
                    const expiry = formatCardExpiry(
                      card.expMonth,
                      card.expYear,
                    );
                    // The brand chip and the row's text are hidden from
                    // assistive tech (below) and spoken from here instead, so a
                    // card arrives as one name in one reading order rather than
                    // as four loose digits.
                    const cardLabel = `${card.brand} card ending ${card.last4} — expires ${expiry}${
                      card.isDefault ? " · Default" : ""
                    }`;

                    return (
                      <label
                        key={card.id}
                        className={`${PAYMENT_OPTION_CLASSES} ${
                          selected
                            ? PICK_CARD_SELECTED_CLASSES
                            : PICK_CARD_IDLE_CLASSES
                        }`}
                      >
                        <input
                          type="radio"
                          name={paymentMethodName}
                          value={card.id}
                          checked={selected}
                          onChange={() =>
                            setPaymentChoice({
                              method: "CARD",
                              savedCardId: card.id,
                            })
                          }
                          aria-label={cardLabel}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={cardBrandChipClasses(card.brand)}
                        >
                          {cardBrandChipLabel(card.brand)}
                        </span>
                        <span aria-hidden="true" className="min-w-0">
                          <span className="block truncate text-sm font-medium text-paper">
                            {card.brand}{" "}
                            <span className="font-price tabular-nums">
                              {maskedCardNumber(card.last4)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">
                            Expires{" "}
                            <span className="font-price tabular-nums">
                              {expiry}
                            </span>
                            {card.isDefault ? " · Default" : null}
                          </span>
                        </span>
                        {selected ? <PaymentSelectedTick /> : null}
                      </label>
                    );
                  })
                : null}

              {payLaterEnabled ? (
                <label
                  className={`${PAYMENT_OPTION_CLASSES} ${
                    paymentChoice?.method === "CASH"
                      ? PICK_CARD_SELECTED_CLASSES
                      : PICK_CARD_IDLE_CLASSES
                  }`}
                >
                  <input
                    type="radio"
                    name={paymentMethodName}
                    value={PAY_LATER_OPTION_VALUE}
                    checked={paymentChoice?.method === "CASH"}
                    onChange={() =>
                      setPaymentChoice({ method: "CASH", savedCardId: null })
                    }
                    aria-label="Pay later — settle after the delivery"
                    className="sr-only"
                  />
                  {/* The brand chip's own geometry, so this row's glyph lines up
                      with the cards above it. A neutral fill rather than a brand
                      tone: nothing was issued. */}
                  <span
                    aria-hidden="true"
                    className={`${CARD_BRAND_CHIP_BASE_CLASSES} bg-surface text-muted`}
                  >
                    <Banknote className="size-4" />
                  </span>
                  <span aria-hidden="true" className="min-w-0">
                    <span className="block text-sm font-medium text-paper">
                      Pay later
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Settle after the delivery
                    </span>
                  </span>
                  {paymentChoice?.method === "CASH" ? (
                    <PaymentSelectedTick />
                  ) : null}
                </label>
              ) : null}
            </div>
          </fieldset>

          {/* `type="button"` by habit rather than necessity: this panel is not
              nested inside a `<form>` on this page, so an unqualified `<button>`
              submits nothing. Kept explicit so the control survives being moved
              back into one. */}
          {cardPaymentEnabled ? (
            <button
              type="button"
              onClick={() => setAddCardOpen(true)}
              className={ADD_CARD_BUTTON_CLASSES}
            >
              + Add card
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-line bg-ink px-3.5 py-2.5 text-[0.8125rem] leading-snug text-muted">
          No payment method is available at the moment, so this delivery
          can&rsquo;t be paid for yet. Your booking is saved — come back and pay
          once a method is switched on.
        </p>
      )}

      {/* Business clients only, and the check is the server's answer, never a
          guess made here. An individual client is never sent this field. */}
      {isBusinessClient ? (
        <div className="mt-4 flex flex-col gap-1.5">
          <Label
            htmlFor={purchaseOrderRefId}
            className="text-[0.8125rem] font-medium text-paper"
          >
            PO or cost-centre reference
          </Label>
          <input
            id={purchaseOrderRefId}
            type="text"
            value={purchaseOrderRef}
            onChange={(event) => setPurchaseOrderRef(event.target.value)}
            // Mirrors the server's own cap on the same field, so an over-long
            // reference is stopped at the keyboard rather than sent and bounced.
            maxLength={PURCHASE_ORDER_REF_MAX_LENGTH}
            placeholder="e.g. PO-2026-0184"
            aria-describedby={purchaseOrderNoteId}
            className={PURCHASE_ORDER_FIELD_CLASSES}
          />
          <p
            id={purchaseOrderNoteId}
            className="text-xs leading-snug text-muted"
          >
            Optional. Appears on your order record for your own finance team.
          </p>
        </div>
      ) : null}

      {/* The live region is mounted unconditionally rather than appearing with
          the message: a region added to the DOM at the same instant it gains
          text is not reliably announced, so the container has to be there and
          waiting before the failure happens. */}
      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p className="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent">
            {error}
          </p>
        ) : null}
      </div>

      {anyMethodEnabled ? (
        <>
          <button
            type="button"
            onClick={handlePay}
            disabled={paymentChoice === null || paying}
            aria-describedby={paymentChoice === null ? payHintId : undefined}
            className={PAY_BUTTON_CLASSES}
          >
            {paying ? "Paying…" : `Pay ${formatGel(totalGel)}`}
          </button>

          {/* Named rather than left to the client to infer from a greyed-out
              button — the same reflex `StepCard` applies to a disabled step. */}
          {paymentChoice === null ? (
            <p
              id={payHintId}
              className="mt-2 text-center text-xs leading-snug text-muted"
            >
              Choose a payment method to continue.
            </p>
          ) : (
            <p className="mt-2 text-center text-xs leading-snug text-muted">
              Nothing is charged now — no payment provider is connected yet.
            </p>
          )}
        </>
      ) : null}

      {/* Portalled to `document.body` by Radix, so it is unaffected by anything
          in this panel's own layout. The dialog keeps two `stopPropagation`
          guards for the booking form, which mounts it inside a real `<form>`;
          they are inert here and are left alone rather than removed, since that
          component is shared. */}
      {cardPaymentEnabled ? (
        <AddCardDialog
          open={addCardOpen}
          onOpenChange={setAddCardOpen}
          isFirstCard={cards.length === 0}
          onSubmit={handleAddCard}
        />
      ) : null}
    </section>
  );
}
