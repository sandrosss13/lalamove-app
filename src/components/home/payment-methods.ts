/**
 * The payment vocabulary the booking form's payment step shares with the server
 * loader that feeds it (`src/lib/home/booking-payment-options.ts`): which
 * methods exist, what a saved card looks like once it reaches the browser, and
 * the two figures a card row prints.
 *
 * **No payment gateway exists and none has been chosen.** Nothing here charges
 * anybody: a saved card is display metadata, and a chosen method is an
 * intention recorded on the order. No PAN and no CVC appears in any type below,
 * because neither ever reaches the server (see `add-card-dialog.tsx`).
 *
 * The two unions mirror the `PaymentMethodType` and `ClientAccountType` Prisma
 * enums rather than importing them, so the server-only Prisma client stays out
 * of the browser bundle — the same reasoning as `src/lib/account-types.ts`. The
 * loader's return-type annotation is what keeps the copies honest: a value the
 * database can produce that is missing from a union here fails typecheck there.
 */

/**
 * A payment method the platform can offer, admin permitting.
 *
 * `CASH` is what the client sees as **Pay later**. There is deliberately no
 * fourth `PAY_LATER` value: the admin toggle page iterates the whole enum, so
 * adding one would put a fourth switch in front of staff for a method that is
 * the same method under a friendlier label.
 */
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER";

/** Whether a client account is an individual's or a business's. */
export type ClientAccountTypeValue = "INDIVIDUAL" | "BUSINESS";

/**
 * The fields a saved-card row renders. Narrower than the stored row on purpose:
 * `createdAt` only ever decided the sort order, which the loader has already
 * applied, and `providerToken` — the column a real gateway's token would one day
 * occupy — is never selected at all.
 */
export type SavedCardSummary = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string | null;
  isDefault: boolean;
};

/** Everything the booking form's payment step is told by the server. */
export type BookingPaymentOptions = {
  /**
   * The methods admin has switched on, in no particular order. Anything absent
   * here must not be offered: `POST /api/orders` refuses a method whose
   * `PaymentMethodConfig` row is disabled or missing, so a row for one would
   * produce an error the client has no way to act on.
   */
  enabledPaymentMethods: PaymentMethod[];
  /** The client's saved cards, default first and then newest first. */
  savedCards: SavedCardSummary[];
  /**
   * The signed-in client's account type, or `null` when the visitor has no
   * client profile to read one from. Resolved on the server precisely so the
   * BUSINESS-only purchase-order field is never a browser-side guess.
   */
  accountType: ClientAccountTypeValue | null;
};

/**
 * What a visitor with nothing to offer gets: no methods, no cards, no account
 * type. Shared between the loader's early returns so "there is nothing to show"
 * is one value rather than three literals that could drift apart.
 */
export const NO_BOOKING_PAYMENT_OPTIONS: BookingPaymentOptions = {
  enabledPaymentMethods: [],
  savedCards: [],
  accountType: null,
};

/**
 * The radio value standing for Pay later. Every other value in the group is a
 * saved card's id — a cuid, which always starts with `c` and never contains a
 * hyphen, so the two can never collide.
 */
export const PAY_LATER_OPTION_VALUE = "pay-later";

/**
 * The masked number a saved card is recognised by. The real number was never
 * sent to this server and is not stored, so the leading group is a placeholder
 * rather than a redaction of anything.
 */
export function maskedCardNumber(last4: string): string {
  return `•••• ${last4}`;
}

/** "08/28" from the stored one-based month and four-digit year. */
export function formatCardExpiry(expMonth: number, expYear: number): string {
  return `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`;
}

/**
 * Pulls the API's own `{ error }` wording out of a failed response, so the
 * client reads the reason the server gave rather than a generic failure. Falls
 * back when the body is missing, unparseable or carries no message.
 *
 * A per-screen copy of the one on the wallet page, by the convention recorded in
 * `earnings-format.ts`: a shared import would tie this step's error handling to
 * a file another screen is free to change.
 */
export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string" &&
    (body as { error: string }).error !== ""
  ) {
    return (body as { error: string }).error;
  }

  return fallback;
}
