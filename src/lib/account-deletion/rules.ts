import type { OrderStatus } from "@prisma/client";

/**
 * The rules of self-service account deletion, as pure functions: who may
 * delete, when they are refused, and exactly what the anonymised rows look
 * like. No Prisma, no session — `server.ts` beside this asks these for every
 * decision and only does the I/O, and `tests/account-deletion-rules.spec.ts`
 * pins them without a database.
 *
 * "Delete" here means **deactivate and anonymise**, never `DELETE FROM user`.
 * `Order.client` is `onDelete: Cascade`, so a real delete would erase the
 * client's orders and, through them, the payouts and wallet postings drivers
 * were credited for those jobs. The account row stays, stripped of everything
 * that identifies a person, with `deactivatedAt` set so the auth gates in
 * `src/lib/auth.ts` refuse it a session forever.
 *
 * Imported by `src/lib/auth.ts` (for the placeholder-email guard on sign-up),
 * so this module must stay free of server-only imports — the Prisma import
 * above is type-only and erased at compile time.
 */

/**
 * Orders that are still in motion: on the board, claimed, accepted or on the
 * road. Deletion is refused while any exists — a driver may be on their way to
 * a pickup, and the client is the person they will phone. Unwinding one of
 * these is a refund-and-reassignment conversation with support, exactly as
 * `POST /api/orders/[id]/cancel` says for every status past `INITIATED`.
 *
 * `INITIATED` is deliberately absent: an unpaid order is off the market, no
 * driver has seen it and no money is owed, so deletion cancels it rather than
 * refusing (the same transition the cancel route makes).
 */
export const ACTIVE_ORDER_STATUSES = [
  "PENDING",
  "CLAIMED",
  "ACCEPTED",
  "IN_TRANSIT",
] as const satisfies readonly OrderStatus[];

/** Machine-readable reasons a deletion is refused, returned as `code`. */
export const ACCOUNT_DELETION_REFUSAL = {
  /** At least one order in `ACTIVE_ORDER_STATUSES`. */
  ACTIVE_ORDERS: "ACTIVE_ORDERS",
  /** Money is held for the client — see `walletBalanceTetri` below. */
  WALLET_BALANCE: "WALLET_BALANCE",
} as const;

export type AccountDeletionRefusal =
  (typeof ACCOUNT_DELETION_REFUSAL)[keyof typeof ACCOUNT_DELETION_REFUSAL];

/** What the eligibility rule needs to know about the account. */
export type AccountDeletionFacts = {
  /** Orders this client holds in any of `ACTIVE_ORDER_STATUSES`. */
  activeOrderCount: number;
  /**
   * Money held on the client's behalf, in integer tetri. Any non-zero value —
   * credit owed to them, or a debt owed by them — refuses deletion, because
   * either way support has to settle it with a person who still exists.
   *
   * Always 0 today: the client "wallet" (`/account/wallet`) is saved-card
   * display metadata only and stores no balance — the only ledger in the
   * schema, `WalletLedgerEntry`, belongs to drivers. The rule is stated now so
   * that a client balance, when one is introduced, has one place to plug in.
   */
  walletBalanceTetri: number;
};

/**
 * Why this account may not be deleted right now, or `null` when it may.
 *
 * Active orders are checked first: they are the more common case, and the one
 * the client can usually resolve themselves by waiting for delivery.
 */
export function accountDeletionRefusal(
  facts: AccountDeletionFacts,
): AccountDeletionRefusal | null {
  if (facts.activeOrderCount > 0) {
    return ACCOUNT_DELETION_REFUSAL.ACTIVE_ORDERS;
  }

  if (facts.walletBalanceTetri !== 0) {
    return ACCOUNT_DELETION_REFUSAL.WALLET_BALANCE;
  }

  return null;
}

/**
 * The domain every deleted account's placeholder email lives under. `.invalid`
 * is reserved by RFC 2606 and can never resolve, so nothing — a receipt, a
 * password reset, a CRM send — can reach a real inbox through it.
 */
export const DELETED_ACCOUNT_EMAIL_DOMAIN = "deleted.zomo.invalid";

/**
 * `User.email` after deletion. Derived from the user id, so it is unique (the
 * column is) and the same on every run — which is what makes deletion
 * idempotent. Sign-up refuses this domain (`src/lib/auth.ts`) so a live
 * account can never squat the address a future deletion will need.
 */
export function deletedAccountEmail(userId: string): string {
  return `deleted+${userId}@${DELETED_ACCOUNT_EMAIL_DOMAIN}`;
}

export function isDeletedAccountPlaceholderEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase().endsWith(`@${DELETED_ACCOUNT_EMAIL_DOMAIN}`)
  );
}

/**
 * `ClientProfile.phone` after deletion. The column is `NOT NULL` and unique,
 * so it cannot simply be cleared; this frees the real number for a new sign-up
 * while staying unique per account. It starts with letters and carries a
 * colon, so it can never equal an E.164 number (`+` and digits only) or be
 * produced by `normalizePhoneNumber` — no future client can collide with it.
 */
export function deletedAccountPhone(userId: string): string {
  return `deleted:${userId}`;
}

/** `User.name` after deletion — what staff and drivers' past jobs now show. */
export const DELETED_ACCOUNT_NAME = "Deleted user";

/**
 * The `User` columns written on deletion. Everything personal goes; the role
 * and timestamps stay so the row still reads as "a client who existed".
 *
 * `isSuspended` and its audit columns are left alone: a suspension is staff's
 * record of a moderation decision, not the client's personal data.
 */
export function buildAnonymisedUserData(userId: string, now: Date) {
  return {
    name: DELETED_ACCOUNT_NAME,
    email: deletedAccountEmail(userId),
    emailVerified: false,
    image: null,
    // Freed so the number can sign up again; `phoneNumberVerified` with it,
    // since a verified flag on no number means nothing.
    phoneNumber: null,
    phoneNumberVerified: false,
    deactivatedAt: now,
  };
}

/**
 * The `ClientProfile` columns written on deletion: every personal and
 * identifying field nulled, the contact phone replaced by its placeholder.
 * `accountType` stays — it says nothing about who the person was, and the
 * order documents of past jobs read it.
 */
export function buildAnonymisedClientProfileData(userId: string) {
  return {
    firstName: null,
    lastName: null,
    companyName: null,
    vatId: null,
    legalAddress: null,
    phone: deletedAccountPhone(userId),
    dateOfBirth: null,
    gender: null,
    idNumber: null,
  };
}

/**
 * The word the client types to confirm, per locale. Kept here rather than only
 * in the message catalogs because the server checks it too: the card shows the
 * word for the page's locale, and the route accepts either, so a client who
 * switches language mid-dialog is not refused for typing the other one.
 */
export const ACCOUNT_DELETION_CONFIRMATION_WORDS = {
  en: "DELETE",
  ka: "წაშლა",
} as const;

/**
 * Whether `typed` is one of the confirmation words. Surrounding whitespace is
 * forgiven; case is not for the Latin word, because typing it in capitals is
 * part of the deliberate act the step exists to require.
 */
export function isAccountDeletionConfirmed(typed: unknown): boolean {
  if (typeof typed !== "string") {
    return false;
  }

  const trimmed = typed.trim();

  return Object.values(ACCOUNT_DELETION_CONFIRMATION_WORDS).some(
    (word) => word === trimmed,
  );
}
