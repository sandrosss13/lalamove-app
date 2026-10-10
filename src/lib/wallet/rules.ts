/**
 * The rules of the driver wallet — its constants, the IBAN check, the one
 * Float-to-tetri conversion, and every decision the ledger makes — with nothing
 * else attached.
 *
 * No runtime imports, so `tests/wallet-rules.spec.ts` pins them without a
 * server or a database, and so the admin pages (client components) can import
 * the bank list without dragging Prisma into the browser. The module that
 * reads and writes rows is `./ledger` and its siblings; every decision they
 * take, they ask this file for.
 */

/* ------------------------------------------------------------------------- */
/* Constants                                                                 */
/* ------------------------------------------------------------------------- */

/** The wallet's only currency. Amounts are integer tetri (1 GEL = 100 tetri). */
export const WALLET_CURRENCY = "GEL";

/** The smallest withdrawal a driver may request: ₾10.00. */
export const MIN_WITHDRAWAL_TETRI = 1000;

/** How many bank accounts (pending, verified or rejected) one driver may hold. */
export const MAX_BANK_ACCOUNTS_PER_DRIVER = 3;

/**
 * The largest single amount the wallet accepts in one withdrawal or one manual
 * adjustment: ₾1,000,000. A sanity bound that keeps every figure far inside a
 * 32-bit column, not a business limit.
 */
export const MAX_WALLET_AMOUNT_TETRI = 100_000_000;

/** Caps on the free text staff and the bank supply. */
export const MAX_WALLET_REASON_LENGTH = 500;
export const MAX_BANK_REFERENCE_LENGTH = 100;
export const MAX_REQUEST_KEY_LENGTH = 100;

/** Paging of the driver's activity and withdrawals lists. */
export const WALLET_PAGE_SIZE_DEFAULT = 20;
export const WALLET_PAGE_SIZE_MAX = 50;

/* ------------------------------------------------------------------------- */
/* Money                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * A lari amount from an `Order` column (a `Float`) as integer tetri.
 *
 * **This is the only place a Float becomes ledger money.** The rounding rule:
 * multiply by 100 and round to the nearest whole tetri, halves up
 * (`Math.round`). Order columns are already rounded to two decimals when they
 * are written (`driverPayoutFor`), so in practice this removes binary noise —
 * `0.29 * 100` is `28.999999999999996`, which truncation would turn into 28
 * tetri — rather than deciding anything; the
 * rule is stated for the value that was not.
 *
 * Each column is converted on its own (payout and overtime are separate ledger
 * entries), never summed as Floats first.
 *
 * Throws on a negative, non-finite or absurdly large amount: a ledger entry is
 * permanent, so a corrupt figure must stop the posting rather than be recorded.
 */
export function toTetri(lari: number): number {
  if (!Number.isFinite(lari) || lari < 0) {
    throw new RangeError(`toTetri: not a non-negative amount: ${lari}`);
  }

  const tetri = Math.round(lari * 100);

  if (tetri > MAX_WALLET_AMOUNT_TETRI) {
    throw new RangeError(`toTetri: amount out of range: ${lari}`);
  }

  return tetri;
}

/** Whether `value` is a usable positive tetri amount for a request body. */
export function isPositiveTetriAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_WALLET_AMOUNT_TETRI
  );
}

/* ------------------------------------------------------------------------- */
/* Banks and IBANs                                                           */
/* ------------------------------------------------------------------------- */

export type GeorgianBank =
  "TBC" | "BANK_OF_GEORGIA" | "LIBERTY" | "PROCREDIT" | "BASISBANK";

/**
 * The design's five banks, in the design's order, each with the two-letter
 * code its IBANs carry in positions 5–6 and its (untranslated) trading name.
 */
export const GEORGIAN_BANKS: readonly {
  bank: GeorgianBank;
  ibanCode: string;
  name: string;
}[] = [
  { bank: "TBC", ibanCode: "TB", name: "TBC Bank" },
  { bank: "BANK_OF_GEORGIA", ibanCode: "BG", name: "Bank of Georgia" },
  { bank: "LIBERTY", ibanCode: "LB", name: "Liberty Bank" },
  { bank: "PROCREDIT", ibanCode: "PC", name: "ProCredit Bank" },
  { bank: "BASISBANK", ibanCode: "BS", name: "Basisbank" },
];

export function isGeorgianBank(value: unknown): value is GeorgianBank {
  return GEORGIAN_BANKS.some((entry) => entry.bank === value);
}

/** A bank's trading name, e.g. "TBC Bank". */
export function bankName(bank: GeorgianBank): string {
  return GEORGIAN_BANKS.find((entry) => entry.bank === bank)?.name ?? bank;
}

/** `GE` + 2 check digits + 2-letter bank code + 16 digits = 22 characters. */
const GEORGIAN_IBAN_PATTERN = /^GE\d{2}[A-Z]{2}\d{16}$/;

/** What a driver typed, as stored: no whitespace, upper case. */
export function normaliseIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * The ISO 13616 check: move the first four characters to the end, read each
 * letter as two digits (A = 10 … Z = 35), and the number must be 1 modulo 97.
 * Computed digit by digit so the 30-odd-digit number never exists as a Float.
 */
export function ibanChecksumIsValid(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;

  for (const character of rearranged) {
    const code = character.charCodeAt(0);
    let digits: string;

    if (code >= 48 && code <= 57) {
      digits = character;
    } else if (code >= 65 && code <= 90) {
      digits = String(code - 55);
    } else {
      return false;
    }

    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

export type IbanRefusal =
  "IBAN_INVALID_FORMAT" | "IBAN_CHECKSUM_INVALID" | "IBAN_BANK_MISMATCH";

export type IbanValidation =
  | { ok: true; iban: string }
  | {
      ok: false;
      refusal: IbanRefusal;
      /** With `IBAN_BANK_MISMATCH`: the bank the IBAN's code names, if one of the five. */
      ibanBank?: GeorgianBank | null;
    };

/**
 * Whether `raw` is a Georgian IBAN at `bank`. Checked in the order a driver
 * can act on: the shape (which is also the length), then the check digits,
 * then that the bank code inside the IBAN is the selected bank's.
 */
export function validateGeorgianIban(
  raw: string,
  bank: GeorgianBank,
): IbanValidation {
  const iban = normaliseIban(raw);

  if (!GEORGIAN_IBAN_PATTERN.test(iban)) {
    return { ok: false, refusal: "IBAN_INVALID_FORMAT" };
  }

  if (!ibanChecksumIsValid(iban)) {
    return { ok: false, refusal: "IBAN_CHECKSUM_INVALID" };
  }

  const ibanCode = iban.slice(4, 6);
  const selected = GEORGIAN_BANKS.find((entry) => entry.bank === bank);

  if (selected === undefined || selected.ibanCode !== ibanCode) {
    return {
      ok: false,
      refusal: "IBAN_BANK_MISMATCH",
      ibanBank:
        GEORGIAN_BANKS.find((entry) => entry.ibanCode === ibanCode)?.bank ??
        null,
    };
  }

  return { ok: true, iban };
}

/** "GE29 TB•• •••• •••• 4417" — the design's mask. */
export function maskIban(iban: string): string {
  return `${iban.slice(0, 4)} ${iban.slice(4, 6)}•• •••• •••• ${iban.slice(-4)}`;
}

/**
 * The name a driver's bank account must be in: their legal name as their
 * profile holds it — the company name for a driver registered as a business,
 * otherwise first and last name. `null` when the profile has none, in which
 * case no account can be added.
 */
export function legalNameOf(profile: {
  accountType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string | null {
  const company = profile.companyName?.trim() ?? "";

  if (profile.accountType === "BUSINESS" && company !== "") {
    return company;
  }

  const first = profile.firstName?.trim() ?? "";
  const last = profile.lastName?.trim() ?? "";

  return first !== "" && last !== "" ? `${first} ${last}` : null;
}

/* ------------------------------------------------------------------------- */
/* The ledger                                                                */
/* ------------------------------------------------------------------------- */

export type WalletEntryType =
  | "JOB_PAYOUT"
  | "JOB_OVERTIME"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL"
  | "ADJUSTMENT";

/**
 * The signed amount an entry of `type` is stored with, from its magnitude:
 * job credits and reversals are positive, a withdrawal is negative. An
 * adjustment carries its own sign and is not built here.
 */
export function signedEntryAmount(
  type: Exclude<WalletEntryType, "ADJUSTMENT">,
  magnitudeTetri: number,
): number {
  if (!Number.isInteger(magnitudeTetri) || magnitudeTetri <= 0) {
    throw new RangeError(`signedEntryAmount: bad magnitude ${magnitudeTetri}`);
  }

  return type === "WITHDRAWAL" ? -magnitudeTetri : magnitudeTetri;
}

/** What a driver holds, and what of it is free to withdraw. */
export type WalletBalances = {
  /** The sum of every ledger entry. */
  balanceTetri: number;
  /** The sum of `PENDING` withdrawals — requested, not yet paid or rejected. */
  reservedTetri: number;
  /** `balanceTetri - reservedTetri`. */
  availableTetri: number;
};

export function walletBalances(
  balanceTetri: number,
  reservedTetri: number,
): WalletBalances {
  return {
    balanceTetri,
    reservedTetri,
    availableTetri: balanceTetri - reservedTetri,
  };
}

/* ------------------------------------------------------------------------- */
/* Crediting a job                                                           */
/* ------------------------------------------------------------------------- */

export type WalletCreditDecision =
  | { kind: "CREDIT" }
  | { kind: "HOLD"; reason: "ROSTER_SELF_CLAIM" }
  | {
      kind: "SKIP";
      reason:
        | "NOT_COMPLETED"
        | "NOT_GATEWAY_CONFIRMED"
        | "CASH"
        | "NO_DRIVER"
        | "COMPANY_JOB";
    };

/** In what capacity a driver claimed a job — `Order.driverClaimedAs`. */
export type DriverClaimCapacity = "INDEPENDENT" | "ROSTER";

/**
 * Whether a job credits its driver's wallet. The whole rule, in one place:
 *
 * 1. The order is `COMPLETED`.
 * 2. Its payment is **gateway-confirmed** (`Payment.gatewayConfirmedAt`) — not
 *    merely `PAID`, which today is written without any charge.
 * 3. It was not a cash job. Cash is settled between client and driver and
 *    stays out of the wallet entirely, in both directions.
 * 4. It has a driver with a profile.
 * 5. It is not a company's job (`Order.companyId`): that is owed to the
 *    company, which has no wallet.
 * 6. It was the driver's **own** job. A roster driver who claimed an open load
 *    themselves (no `companyId` on the order) is the one unresolved case: it
 *    credits nobody and is recorded as a `HOLD` for staff to see.
 *
 * ## Rule 6 is decided by the record of the claim, not by the roster today
 *
 * `claimedAs` is what the order recorded when the driver claimed it. Rules 1
 * and 2 can become true long after that — a gateway may confirm days later —
 * and a driver's roster membership (`driver.companyId`) is a fact about the
 * moment it is read. Deciding on it alone credited a driver **personally** for
 * a job they took while employed, if their company removed them before the
 * confirmation arrived.
 *
 * - `claimedAs: "ROSTER"` → `HOLD`, whatever the driver is now.
 * - `claimedAs: "INDEPENDENT"` → the job is theirs — but it is still held if
 *   they are on a roster **now**: a roster driver has no wallet to credit
 *   (withdrawals and adjustments both refuse one), so crediting it would post
 *   money to a balance nobody can see or pay out. Held is the outcome staff
 *   are shown; a silently unreachable credit is not.
 * - `claimedAs: null` → a job claimed before the record existed. Nothing is
 *   known about the claim, so the roster today is read, as it always was.
 *
 * So the record only ever *adds* a reason to hold; it never turns a hold into
 * a credit.
 */
export function walletCreditDecisionFor(job: {
  orderStatus: string;
  paymentMethodType: string | null;
  gatewayConfirmed: boolean;
  orderCompanyId: string | null;
  /** `Order.driverClaimedAs`; `null` for a job claimed before it was recorded. */
  claimedAs: DriverClaimCapacity | null;
  /** The assigned driver's profile, or `null` when there is none. */
  driver: { companyId: string | null } | null;
}): WalletCreditDecision {
  if (job.orderStatus !== "COMPLETED") {
    return { kind: "SKIP", reason: "NOT_COMPLETED" };
  }

  if (!job.gatewayConfirmed) {
    return { kind: "SKIP", reason: "NOT_GATEWAY_CONFIRMED" };
  }

  if (job.paymentMethodType === "CASH") {
    return { kind: "SKIP", reason: "CASH" };
  }

  if (job.driver === null) {
    return { kind: "SKIP", reason: "NO_DRIVER" };
  }

  if (job.orderCompanyId !== null) {
    return { kind: "SKIP", reason: "COMPANY_JOB" };
  }

  const wasRosterAtClaim = job.claimedAs === "ROSTER";
  const isRosterNow = job.driver.companyId !== null;

  if (wasRosterAtClaim || isRosterNow) {
    return { kind: "HOLD", reason: "ROSTER_SELF_CLAIM" };
  }

  return { kind: "CREDIT" };
}

/* ------------------------------------------------------------------------- */
/* Withdrawing                                                               */
/* ------------------------------------------------------------------------- */

export type BankAccountStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type WithdrawalStatus = "PENDING" | "PAID" | "REJECTED" | "REVERSED";

export const BANK_ACCOUNT_STATUSES: readonly BankAccountStatus[] = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
];

export const WITHDRAWAL_STATUSES: readonly WithdrawalStatus[] = [
  "PENDING",
  "PAID",
  "REJECTED",
  "REVERSED",
];

export function isBankAccountStatus(
  value: unknown,
): value is BankAccountStatus {
  return BANK_ACCOUNT_STATUSES.some((status) => status === value);
}

export function isWithdrawalStatus(value: unknown): value is WithdrawalStatus {
  return WITHDRAWAL_STATUSES.some((status) => status === value);
}

export type WithdrawalRefusal =
  | "WALLET_FROZEN"
  | "BELOW_MINIMUM"
  | "BANK_ACCOUNT_NOT_VERIFIED"
  | "INSUFFICIENT_FUNDS";

/**
 * Why a withdrawal of `amountTetri` to `accountStatus` is refused, or `null`.
 *
 * A suspended driver's wallet is frozen: nothing new may be requested, while
 * withdrawals already pending stay exactly as they are. (Suspension also
 * destroys the driver's session, so over HTTP it normally arrives as a 401
 * before this is asked; the check is here for the request already in flight.)
 */
export function withdrawalRefusalFor(request: {
  amountTetri: number;
  availableTetri: number;
  isSuspended: boolean;
  accountStatus: BankAccountStatus;
}): WithdrawalRefusal | null {
  if (request.isSuspended) {
    return "WALLET_FROZEN";
  }

  if (request.amountTetri < MIN_WITHDRAWAL_TETRI) {
    return "BELOW_MINIMUM";
  }

  if (request.accountStatus !== "VERIFIED") {
    return "BANK_ACCOUNT_NOT_VERIFIED";
  }

  if (request.amountTetri > request.availableTetri) {
    return "INSUFFICIENT_FUNDS";
  }

  return null;
}

export type WithdrawBlockedReason =
  "WALLET_FROZEN" | "NO_VERIFIED_BANK_ACCOUNT" | "BELOW_MINIMUM";

/**
 * Why the summary's Withdraw button is disabled, or `null` when a withdrawal
 * of the full available amount would be accepted right now.
 */
export function withdrawBlockedReasonFor(wallet: {
  availableTetri: number;
  isSuspended: boolean;
  hasVerifiedAccount: boolean;
}): WithdrawBlockedReason | null {
  if (wallet.isSuspended) {
    return "WALLET_FROZEN";
  }

  if (!wallet.hasVerifiedAccount) {
    return "NO_VERIFIED_BANK_ACCOUNT";
  }

  if (wallet.availableTetri < MIN_WITHDRAWAL_TETRI) {
    return "BELOW_MINIMUM";
  }

  return null;
}

/**
 * Whether a manual adjustment may be posted: any non-zero whole amount within
 * the sanity bound that does not push what the driver can withdraw below zero
 * (a debit larger than the free balance would leave pending withdrawals
 * unfunded).
 */
export function adjustmentRefusalFor(adjustment: {
  amountTetri: number;
  availableTetri: number;
}): "INVALID_AMOUNT" | "EXCEEDS_AVAILABLE" | null {
  const { amountTetri, availableTetri } = adjustment;

  if (
    !Number.isInteger(amountTetri) ||
    amountTetri === 0 ||
    Math.abs(amountTetri) > MAX_WALLET_AMOUNT_TETRI
  ) {
    return "INVALID_AMOUNT";
  }

  if (amountTetri < 0 && availableTetri + amountTetri < 0) {
    return "EXCEEDS_AVAILABLE";
  }

  return null;
}

/* ------------------------------------------------------------------------- */
/* Small parsers                                                             */
/* ------------------------------------------------------------------------- */

/**
 * A required piece of free text (a reason, a bank reference): trimmed, and
 * `null` when it is not a string, is empty, or is longer than `maxLength`.
 */
export function parseRequiredText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" || trimmed.length > maxLength ? null : trimmed;
}

/** `?limit=` → a page size within bounds; anything unusable is the default. */
export function parsePageSize(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return WALLET_PAGE_SIZE_DEFAULT;
  }

  return Math.min(parsed, WALLET_PAGE_SIZE_MAX);
}
