"use client";

import type * as React from "react";
import { useCallback, useEffect, useId, useState } from "react";
import { X } from "lucide-react";

import {
  cardBrandChipClasses,
  cardBrandChipLabel,
  detectCardBrand,
} from "@/components/home/card-brand";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/**
 * The "Add card" dialog, shared by the wallet page and the booking form's
 * payment step.
 *
 * **No payment gateway exists and none has been chosen.** This dialog is built
 * so that the card number and the security code never leave the browser: they
 * are typed here, used here to derive the brand and the last four digits, and
 * discarded when the dialog closes. Only display metadata — brand, last four,
 * expiry, holder name and the default flag — is handed to `onSubmit`, and
 * `POST /api/saved-cards` refuses outright any body carrying a PAN- or
 * CVC-shaped field. Nothing in this file writes either value to a fetch body, a
 * query string, a log, an analytics call, `localStorage`, `sessionStorage` or a
 * URL, and no input carries a `name` attribute that a stray form submission
 * could pick up.
 *
 * That is what makes a full card form safe while the integration is pending:
 * wiring a real gateway later means replacing one client-side call with a
 * tokenisation request, not rebuilding this UI.
 *
 * Colour rule: landing token utilities only, never a hex literal and never a
 * `dark:` variant — neither surface that renders this dialog carries
 * `data-landing-page`, so `dark:` cannot match (see `globals.css`). The brand
 * chip's palette utilities are the single deliberate exception, and they live in
 * `card-brand.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Display metadata for a new card. Deliberately holds no PAN and no CVC. */
export type NewCardInput = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string;
  isDefault: boolean;
};

export type AddCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-checks "set as default" when the client has no cards yet. */
  isFirstCard: boolean;
  /**
   * Receives display metadata only — never the PAN or CVC. Reject with an
   * `Error` whose message is the server's own `{ error }` wording to have it
   * shown inline; resolving closes the dialog and clears every field.
   */
  onSubmit: (card: NewCardInput) => Promise<void> | void;
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Longest PAN in issue (19 digits), and the shortest this form accepts (14). */
const MAX_CARD_DIGITS = 19;
const MIN_CARD_DIGITS = 14;

/** A security code is three digits, or four on an Amex. */
const MIN_CVC_DIGITS = 3;
const MAX_CVC_DIGITS = 4;

/** Digits typed before the brand chip appears. */
const BRAND_CHIP_MIN_DIGITS = 2;

/** Shown when a rejected submission carries no message of its own. */
const SAVE_FAILED_FALLBACK = "Could not save the card. Try again.";

const FIELD_LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

const FIELD_CLASSES =
  "h-12 w-full rounded-lg border border-line bg-ink px-3.5 text-sm text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

/**
 * The card-number field is a bordered box rather than a bordered input, because
 * the brand chip sits inside it; the focus ring therefore moves to the box.
 */
const CARD_NUMBER_BOX_CLASSES =
  "flex h-12 w-full items-center gap-2 rounded-lg border border-line bg-ink px-3.5 transition-colors focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20";

const CARD_NUMBER_INPUT_CLASSES =
  "min-w-0 flex-1 bg-transparent font-price text-sm tracking-[0.04em] text-paper outline-none placeholder:text-muted";

/**
 * Grey fill and a not-allowed cursor rather than a fade, matching the house
 * pattern at `drivers-add-panel.tsx:488`, with the token names adapted to the
 * landing set: `muted` there is a surface, here it is a text colour, so the fill
 * comes from `line` and the text from `muted`. `disabled:pointer-events-auto` is
 * what lets the cursor show at all on a disabled button.
 */
const SAVE_BUTTON_CLASSES =
  "h-11 rounded-lg bg-accent px-5 text-[0.8125rem] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:opacity-100";

const CANCEL_BUTTON_CLASSES =
  "h-11 rounded-lg px-4 text-[0.8125rem] font-semibold text-accent transition-colors hover:text-accent-hover";

/* -------------------------------------------------------------------------- */
/* Formatting and validation                                                  */
/* -------------------------------------------------------------------------- */

/** Strips a display value down to its digits. */
function toDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** "4111111111111111" → "4111 1111 1111 1111", capped at the longest PAN. */
function formatCardNumber(value: string): string {
  return toDigits(value)
    .slice(0, MAX_CARD_DIGITS)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/** "1229" → "12/29". The slash appears as soon as a third digit is typed. */
function formatExpiry(value: string): string {
  const digits = toDigits(value).slice(0, 4);

  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

type Expiry = { month: number; year: number };

/**
 * Reads `MM/YY`, or `null` when the value is not yet a complete, real month.
 * The two-digit year is read as this century: no card in issue expires in the
 * 1900s, and every printed expiry is the last two digits of a 20xx year.
 */
function parseExpiry(value: string): Expiry | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }

  const month = Number(match[1]);
  if (month < 1 || month > 12) {
    return null;
  }

  return { month, year: 2000 + Number(match[2]) };
}

/**
 * True once an expiry has passed. A card is valid to the last day of its expiry
 * month, so the comparison is month-granular — the same rule the API applies.
 */
function hasExpired({ month, year }: Expiry): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  // `getMonth()` is zero-based; a printed expiry month is one-based.
  const currentMonth = now.getMonth() + 1;

  return year < currentYear || (year === currentYear && month < currentMonth);
}

type CardFormValues = {
  cardNumber: string;
  expiry: string;
  cvc: string;
  holderName: string;
};

/**
 * The first thing still missing, in field order, as an imperative naming the
 * fix — never a list, so the reader is told one thing to do next. `null` once
 * the form may be submitted.
 */
function firstMissingRequirement(values: CardFormValues): string | null {
  if (toDigits(values.cardNumber).length < MIN_CARD_DIGITS) {
    return `Enter a card number of at least ${MIN_CARD_DIGITS} digits.`;
  }

  const expiry = parseExpiry(values.expiry);
  if (expiry === null) {
    return "Enter the expiry date as MM/YY.";
  }

  if (hasExpired(expiry)) {
    return "Enter an expiry date in the future.";
  }

  if (toDigits(values.cvc).length < MIN_CVC_DIGITS) {
    return "Enter the three- or four-digit security code.";
  }

  if (values.holderName.trim() === "") {
    return "Enter the name printed on the card.";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AddCardDialog({
  open,
  onOpenChange,
  isFirstCard,
  onSubmit,
}: AddCardDialogProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [holderName, setHolderName] = useState("");
  const [isDefault, setIsDefault] = useState(isFirstCard);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldId = useId();
  const cardNumberId = `${fieldId}-card-number`;
  const expiryId = `${fieldId}-expiry`;
  const cvcId = `${fieldId}-cvc`;
  const holderNameId = `${fieldId}-holder-name`;
  const defaultCheckboxId = `${fieldId}-default`;
  const reasonId = `${fieldId}-reason`;

  const resetForm = useCallback(() => {
    setCardNumber("");
    setExpiry("");
    setCvc("");
    setHolderName("");
    setIsDefault(isFirstCard);
    setSubmitting(false);
    setError(null);
  }, [isFirstCard]);

  // Clears the card number and the security code whenever the dialog is closed,
  // by any route — Cancel, the close button, Escape, the backdrop, or the parent
  // simply setting `open` to false. The early return keeps a change of
  // `isFirstCard` from wiping a form the client is still filling in.
  useEffect(() => {
    if (open) {
      return;
    }

    resetForm();
  }, [open, resetForm]);

  const digits = toDigits(cardNumber);
  const brand = detectCardBrand(digits);
  const missingRequirement = firstMissingRequirement({
    cardNumber,
    expiry,
    cvc,
    holderName,
  });
  const canSubmit = missingRequirement === null && !submitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedExpiry = parseExpiry(expiry);
    if (!canSubmit || parsedExpiry === null) {
      return;
    }

    // THE SECURITY RULE. The PAN and the CVC never leave this component: they
    // are used here to derive the brand and the last four digits, then
    // discarded. `POST /api/saved-cards` rejects any body containing a
    // card-number- or CVC-shaped field, so there is nothing to send even if a
    // future edit were tempted to.
    const card: NewCardInput = {
      brand,
      last4: digits.slice(-4),
      expMonth: parsedExpiry.month,
      expYear: parsedExpiry.year,
      holderName: holderName.trim(),
      isDefault,
    };

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(card);

      // Clear before closing rather than relying on the close effect, so the
      // sensitive fields are gone the moment the work succeeds.
      resetForm();
      onOpenChange(false);
    } catch (submitError) {
      // The server's own `{ error }` wording where the caller passed it
      // through, since it says which field the API objected to.
      setError(
        submitError instanceof Error && submitError.message !== ""
          ? submitError.message
          : SAVE_FAILED_FALLBACK,
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `onKeyDown` stops here, and it has to: this dialog is rendered from
          inside the booking form's `<form onKeyDown={handleFormKeyDown}>`.
          Radix portals the panel to `document.body`, but React dispatches
          synthetic events along the *React* tree, not the DOM tree, so a
          keypress in a card field still reaches that handler — which
          `preventDefault()`s every non-textarea Enter and re-quotes the
          delivery. `stopPropagation` on the synthetic event is what ends the
          cross-portal walk; `preventDefault` alone does not. Radix listens for
          Escape in the capture phase on the document, so closing the dialog is
          unaffected.

          `ring-0` rather than a retint: the primitive's own `ring-1
          ring-foreground/10` would otherwise sit on top of this panel's
          `border-line`, drawing the edge twice. */}
      <DialogContent
        showCloseButton={false}
        onKeyDown={(event) => event.stopPropagation()}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto border border-line bg-ink p-5 text-paper ring-0 sm:max-w-[440px]"
      >
        <DialogHeader className="gap-1 pr-8">
          {/* `font-sans` overrides the primitive's `font-display`: this is an
              eyebrow, and its 13px/600/wide-tracking treatment assumes the body
              face. */}
          <DialogTitle className="font-sans text-[0.8125rem] font-semibold tracking-[0.1em] text-muted uppercase">
            Add card
          </DialogTitle>
          <DialogDescription className="text-[0.8125rem] leading-snug text-muted">
            Credit or debit card. Nothing is charged until you book a delivery.
          </DialogDescription>
        </DialogHeader>

        <DialogClose asChild>
          <button
            type="button"
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-paper"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </DialogClose>

        {/* Required, and deliberately impossible to miss: the client is typing a
            card number into a form with no gateway behind it, and is owed a
            plain statement of what does and does not happen to it.

            Scope of the guarantee: it covers this application. The card-number
            field carries `autoComplete="cc-number"` — correct, and what makes
            the browser's own autofill work — so the browser may still offer to
            remember the number in its card manager. That is the user's own
            browser and their own choice; nothing here transmits or stores it. */}
        <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-muted">
          Gateway integration is pending. Your card details are not sent
          anywhere and nothing is charged — only the brand and last four digits
          are saved so you can recognise the card.
        </p>

        <form
          // A real `<form>` is right for a card-entry panel with a submit
          // button — but "Save card" fires a DOM `submit` that React then
          // propagates along the React tree, across the portal, into the
          // booking form's `onSubmit`, which would `POST /api/orders`.
          // `stopPropagation` on the synthetic event is the only thing that
          // ends that walk: `preventDefault` (already called in
          // `handleSubmit`) suppresses the browser's navigation, not React's
          // propagation. Removing this places an order every time a card is
          // saved.
          onSubmit={(event) => {
            event.stopPropagation();
            void handleSubmit(event);
          }}
          className="mt-4 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={cardNumberId} className={FIELD_LABEL_CLASSES}>
              Card number
            </Label>
            <div className={CARD_NUMBER_BOX_CLASSES}>
              <input
                id={cardNumberId}
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(event) =>
                  setCardNumber(formatCardNumber(event.target.value))
                }
                className={CARD_NUMBER_INPUT_CLASSES}
              />
              {digits.length >= BRAND_CHIP_MIN_DIGITS ? (
                <span
                  aria-hidden="true"
                  className={cardBrandChipClasses(brand)}
                >
                  {cardBrandChipLabel(brand)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={expiryId} className={FIELD_LABEL_CLASSES}>
                Expiry
              </Label>
              <input
                id={expiryId}
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={expiry}
                onChange={(event) =>
                  setExpiry(formatExpiry(event.target.value))
                }
                className={`${FIELD_CLASSES} font-price tracking-[0.04em]`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={cvcId} className={FIELD_LABEL_CLASSES}>
                CVC
              </Label>
              <input
                id={cvcId}
                type="text"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                value={cvc}
                onChange={(event) =>
                  setCvc(toDigits(event.target.value).slice(0, MAX_CVC_DIGITS))
                }
                className={`${FIELD_CLASSES} font-price tracking-[0.04em]`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={holderNameId} className={FIELD_LABEL_CLASSES}>
              Name on card
            </Label>
            <input
              id={holderNameId}
              type="text"
              autoComplete="cc-name"
              placeholder="As printed on the card"
              value={holderName}
              onChange={(event) => setHolderName(event.target.value)}
              className={FIELD_CLASSES}
            />
          </div>

          <div className="flex items-center gap-2.5">
            <input
              id={defaultCheckboxId}
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              // `accent-accent` tints the native control with the landing
              // accent, which is enough here: a bespoke checkbox would be a
              // fourth focus-ring implementation on this surface.
              className="size-4 shrink-0 accent-accent"
            />
            <Label
              htmlFor={defaultCheckboxId}
              className="text-[0.8125rem] font-normal text-paper"
            >
              Set as default payment method
            </Label>
          </div>

          {error === null ? null : (
            <p role="alert" className="text-[0.8125rem] text-accent">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-end gap-2">
              <DialogClose asChild>
                <button type="button" className={CANCEL_BUTTON_CLASSES}>
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={!canSubmit}
                // A disabled button leaves the tab order, so a `title` would be
                // unreachable: the reason is a real element, pointed at from
                // here, and read out with the button.
                aria-describedby={
                  missingRequirement === null ? undefined : reasonId
                }
                className={SAVE_BUTTON_CLASSES}
              >
                {submitting ? "Saving…" : "Save card"}
              </button>
            </div>
            {missingRequirement === null ? null : (
              <p id={reasonId} className="text-right text-xs text-muted">
                {missingRequirement}
              </p>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
