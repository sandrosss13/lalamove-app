/**
 * The body parser for `POST /api/orders/[id]/pay`, moved out of the route so
 * its rules can be unit tested — and because guest checkout made those rules
 * depend on **who is paying**, which is now a parameter rather than something
 * the parser could assume.
 *
 * Three payers, three rulebooks:
 *
 * - **`BUSINESS`** — unchanged: `CARD` with a saved card, or `CASH` ("Pay
 *   later"), plus an optional purchase-order reference.
 * - **`INDIVIDUAL`** (a signed-in client without a business account) — card
 *   only. "Pay later" does not exist for individuals; `CASH` is refused.
 * - **`GUEST`** (an order booked without an account) — card only, and the
 *   card is a **one-off**: its display metadata comes in `card`, validated
 *   like a saved card's, and is never saved. The guest's contact
 *   (`guestContact`) is required, validated by `parseGuestContact`, and
 *   refused with per-field codes the checkout form shows under each input.
 *   A `savedCardId` is refused: a guest has no wallet.
 *
 * `card` and `guestContact` are ignored for account payers — a signed-in
 * client pays with a saved card and their contact is their account.
 *
 * Pure: no Prisma client, no request state. It only *parses* — whether the
 * method is switched on, whether the saved card is the caller's, and whether
 * the order is still unpaid are database questions the route answers.
 */

import { PaymentMethodType } from "@prisma/client";

import type { RequestTranslator } from "@/i18n/request-locale";
import {
  parseGuestContact,
  type GuestContactErrors,
  type GuestContactInput,
} from "@/lib/orders/guest-contact";
import {
  CARD_DETAILS_REJECTED_KEY,
  containsCardDetails,
  parseCardMetadata,
  type CardMetadataInput,
} from "@/lib/payments/card-metadata";

/**
 * Longest accepted purchase-order reference, mirroring the cap
 * `POST /api/orders` applies to the same column.
 */
const FREE_TEXT_MAX_LENGTH = 200;

/**
 * The methods checkout may record. Deliberately narrower than
 * `PaymentMethodType`: the checkout page offers exactly two rows — a card and
 * "Pay later", which *is* `CASH` under a friendlier label — so accepting
 * `BANK_TRANSFER` here would let a hand-made request stamp an order with a
 * method that has no UI, no instructions to the client and no flow behind it.
 * Admin's own `PaymentMethodConfig` switch is checked separately by the route
 * and can still refuse either of these two; this list only bounds what the
 * register will parse at all.
 */
export const CHECKOUT_PAYMENT_METHODS: readonly PaymentMethodType[] = [
  PaymentMethodType.CARD,
  PaymentMethodType.CASH,
];

/** Who is paying, which decides the rules the body is held to. */
export type PayerKind = "GUEST" | "INDIVIDUAL" | "BUSINESS";

/** Validated shape of a pay request body. */
export type PayOrderInput = {
  paymentMethodType: PaymentMethodType;
  /** A saved card — required for an account payer's `CARD`, else `null`. */
  savedCardId: string | null;
  /** Kept only for BUSINESS payers — dropped (not refused) for anyone else. */
  purchaseOrderRef: string | null;
  /** The guest's contact; `null` for an account payer. */
  guestContact: GuestContactInput | null;
  /** The guest's one-off card; `null` for an account payer. */
  card: CardMetadataInput | null;
};

/** A refusal: one translated sentence, plus per-field codes when the problem
 *  is the guest's contact form. */
export type PayOrderBodyError = {
  error: string;
  fieldErrors?: GuestContactErrors;
};

/**
 * Trim an optional free-text field to its stored form: `null` when absent or
 * blank, the trimmed string otherwise, or an error when it is the wrong type or
 * over length.
 */
function parseOptionalText(
  value: unknown,
  fieldName: string,
  t: RequestTranslator,
): { value: string | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "string") {
    return {
      error: t("errors.ordersPay.fieldMustBeStringWhenProvided", {
        field: fieldName,
      }),
    };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null };
  }

  if (trimmed.length > FREE_TEXT_MAX_LENGTH) {
    return {
      error: t("errors.ordersPay.fieldTooLong", {
        field: fieldName,
        max: FREE_TEXT_MAX_LENGTH,
      }),
    };
  }

  return { value: trimmed };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the
 * project deliberately uses no validation library). Here the method *is* the
 * request, so an absent one is an error rather than a `null` to store.
 *
 * Checks run in the order a person can act on them: the method, then (for a
 * guest) the contact form, then the card. `now` is injectable for tests; it
 * decides whether a one-off card has expired.
 */
export function parsePayOrderBody(
  body: unknown,
  payer: PayerKind,
  t: RequestTranslator,
  now: Date = new Date(),
): { data: PayOrderInput } | PayOrderBodyError {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const record = body as Record<string, unknown>;

  const { paymentMethodType } = record;
  if (
    typeof paymentMethodType !== "string" ||
    !CHECKOUT_PAYMENT_METHODS.includes(paymentMethodType as PaymentMethodType)
  ) {
    return {
      error: t("errors.ordersPay.paymentMethodTypeMustBeOneOf", {
        allowed: CHECKOUT_PAYMENT_METHODS.join(", "),
      }),
    };
  }

  const method = paymentMethodType as PaymentMethodType;

  // "Pay later" is a business arrangement: an individual — signed in or a
  // guest — settles by card before the job goes to drivers.
  if (method === PaymentMethodType.CASH && payer !== "BUSINESS") {
    return { error: t("errors.ordersPay.payLaterIsNotAvailable") };
  }

  const { savedCardId } = record;
  if (
    savedCardId !== undefined &&
    (typeof savedCardId !== "string" || savedCardId.trim().length === 0)
  ) {
    return { error: t("common.shared.savedcardidMustBeANonEmpty") };
  }

  const chosenCardId =
    typeof savedCardId === "string" ? savedCardId.trim() : null;

  const purchaseOrderRef = parseOptionalText(
    record.purchaseOrderRef,
    "purchaseOrderRef",
    t,
  );
  if ("error" in purchaseOrderRef) {
    return purchaseOrderRef;
  }

  if (payer === "GUEST") {
    // A guest has no wallet, so no card id can be theirs — the same answer an
    // account payer gets for somebody else's card.
    if (chosenCardId !== null) {
      return { error: t("common.shared.chooseACardSavedToYour") };
    }

    const contact = parseGuestContact(record.guestContact);
    if ("errors" in contact) {
      return {
        error: t("errors.ordersPay.enterYourContactDetails"),
        fieldErrors: contact.errors,
      };
    }

    if (record.card === undefined || record.card === null) {
      return { error: t("errors.ordersPay.enterTheCardYouArePaying") };
    }

    // The tripwire runs on the card object alone, before it is parsed — see
    // `containsCardDetails` for why the whole body is not scanned.
    if (containsCardDetails(record.card)) {
      return { error: t(CARD_DETAILS_REJECTED_KEY) };
    }

    const card = parseCardMetadata(record.card, t, now);
    if ("error" in card) {
      return card;
    }

    return {
      data: {
        paymentMethodType: method,
        savedCardId: null,
        // A guest is never a business; the reference is dropped, as it is for
        // an individual.
        purchaseOrderRef: null,
        guestContact: contact.data,
        card: card.data,
      },
    };
  }

  // A card and the method it pays with have to agree — the same two messages
  // `POST /api/orders` gives, for the same reason: paying by card without
  // naming one is unpayable, and a card sent alongside Pay later means the
  // client changed method without clearing its card. Say which of the two to
  // change rather than quietly picking one.
  if (method === PaymentMethodType.CARD && chosenCardId === null) {
    return { error: t("common.shared.chooseASavedCardToPay") };
  }

  if (method !== PaymentMethodType.CARD && chosenCardId !== null) {
    return {
      error: t("common.shared.sendSavedcardidOnlyWhenPaymentmethodtypeIs"),
    };
  }

  return {
    data: {
      paymentMethodType: method,
      savedCardId: chosenCardId,
      purchaseOrderRef: payer === "BUSINESS" ? purchaseOrderRef.value : null,
      guestContact: null,
      card: null,
    },
  };
}
