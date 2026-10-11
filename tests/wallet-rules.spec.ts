/**
 * The rules of the driver wallet, pinned without a server or a database: the
 * IBAN check, the one Float-to-tetri conversion, when a job credits, when a
 * withdrawal is refused, and what the wire carries.
 *
 * `src/lib/wallet/rules.ts` is the single statement of each — the ledger, the
 * routes and the admin pages ask it for every decision.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  toWalletBankAccount,
  toWalletEntry,
  toWalletSummaryResponse,
  toWalletWithdrawal,
} from "@/lib/mobile-api/serializers";
import {
  GEORGIAN_BANKS,
  MAX_BANK_ACCOUNTS_PER_DRIVER,
  MIN_WITHDRAWAL_TETRI,
  adjustmentRefusalFor,
  ibanChecksumIsValid,
  legalNameOf,
  maskIban,
  normaliseIban,
  parsePageSize,
  parseRequiredText,
  signedEntryAmount,
  toTetri,
  validateGeorgianIban,
  walletBalances,
  walletCreditDecisionFor,
  withdrawBlockedReasonFor,
  withdrawalRefusalFor,
  type DriverClaimCapacity,
} from "@/lib/wallet/rules";

const REPO = process.cwd();

/* ------------------------------------------------------------------------- */
/* Constants                                                                 */
/* ------------------------------------------------------------------------- */

test("the minimum withdrawal is ₾10.00 and the account cap is three", () => {
  expect(MIN_WITHDRAWAL_TETRI).toBe(1000);
  expect(MAX_BANK_ACCOUNTS_PER_DRIVER).toBe(3);
});

test("the banks are the design's five, in order, with their IBAN codes", () => {
  expect(GEORGIAN_BANKS.map((entry) => [entry.name, entry.ibanCode])).toEqual([
    ["TBC Bank", "TB"],
    ["Bank of Georgia", "BG"],
    ["Liberty Bank", "LB"],
    ["ProCredit Bank", "PC"],
    ["Basisbank", "BS"],
  ]);
});

/* ------------------------------------------------------------------------- */
/* IBAN                                                                      */
/* ------------------------------------------------------------------------- */

test.describe("IBAN validation", () => {
  /** Real mod-97 check digits, one per bank. */
  const VALID = {
    TBC: "GE35TB0000000000004417",
    BANK_OF_GEORGIA: "GE39BG0000000000009032",
    LIBERTY: "GE52LB0000000000001234",
    PROCREDIT: "GE19PC0000000000005678",
    BASISBANK: "GE14BS0000000000009999",
  } as const;

  test("accepts a valid IBAN for each of the five banks", () => {
    for (const { bank } of GEORGIAN_BANKS) {
      expect(validateGeorgianIban(VALID[bank], bank)).toEqual({
        ok: true,
        iban: VALID[bank],
      });
    }
  });

  test("the mod-97 check agrees with well-known foreign IBANs too", () => {
    // The ISO 13616 examples: the arithmetic is not Georgia-specific.
    expect(ibanChecksumIsValid("GB82WEST12345698765432")).toBe(true);
    expect(ibanChecksumIsValid("DE89370400440532013000")).toBe(true);
    expect(ibanChecksumIsValid("GB83WEST12345698765432")).toBe(false);
  });

  test("normalises spaces and case before judging", () => {
    expect(normaliseIban(" ge35 tb00 0000 0000 0044 17 ")).toBe(VALID.TBC);
    expect(validateGeorgianIban("ge35 tb00 0000 0000 0044 17", "TBC")).toEqual({
      ok: true,
      iban: VALID.TBC,
    });
  });

  test("refuses the wrong shape — length, country, letters — as a format error", () => {
    for (const iban of [
      "",
      "GE35TB000000000000441", // 21 characters
      "GE35TB00000000000044170", // 23 characters
      "DE35TB0000000000004417", // not Georgian
      "GE35T10000000000004417", // bank code must be two letters
      "GE35TB00000000000044A7", // account part must be digits
      "GEXXTB0000000000004417", // check digits must be digits
    ]) {
      expect(validateGeorgianIban(iban, "TBC")).toEqual({
        ok: false,
        refusal: "IBAN_INVALID_FORMAT",
      });
    }
  });

  test("refuses wrong check digits, a changed digit and a transposition", () => {
    for (const iban of [
      "GE36TB0000000000004417", // check digits off by one
      "GE35TB0000000000004418", // last digit changed
      "GE35TB0000000000004471", // two digits swapped
      "GE00TB0000000000004417",
    ]) {
      expect(validateGeorgianIban(iban, "TBC")).toEqual({
        ok: false,
        refusal: "IBAN_CHECKSUM_INVALID",
      });
    }
  });

  test("refuses an IBAN of another bank, naming that bank when it is one of the five", () => {
    expect(validateGeorgianIban(VALID.TBC, "BANK_OF_GEORGIA")).toEqual({
      ok: false,
      refusal: "IBAN_BANK_MISMATCH",
      ibanBank: "TBC",
    });

    // A valid IBAN whose bank code is none of the five.
    expect(validateGeorgianIban("GE80XX0000000000001111", "TBC")).toEqual({
      ok: false,
      refusal: "IBAN_BANK_MISMATCH",
      ibanBank: null,
    });
  });

  test("masks an IBAN as the design does", () => {
    expect(maskIban(VALID.TBC)).toBe("GE35 TB•• •••• •••• 4417");
  });
});

test.describe("the account holder's legal name", () => {
  const base = {
    accountType: "INDIVIDUAL",
    firstName: "Nino",
    lastName: "Abashidze",
    companyName: null,
  };

  test("is first and last name for a person", () => {
    expect(legalNameOf(base)).toBe("Nino Abashidze");
    expect(
      legalNameOf({ ...base, accountType: "INDIVIDUAL_ENTREPRENEUR" }),
    ).toBe("Nino Abashidze");
  });

  test("is the company name for a business", () => {
    expect(
      legalNameOf({
        ...base,
        accountType: "BUSINESS",
        companyName: " Gizo LLC ",
      }),
    ).toBe("Gizo LLC");
  });

  test("is null when the profile has none", () => {
    expect(legalNameOf({ ...base, lastName: null })).toBeNull();
    expect(legalNameOf({ ...base, firstName: "  " })).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* Tetri                                                                     */
/* ------------------------------------------------------------------------- */

test.describe("toTetri", () => {
  test("turns a two-decimal lari amount into exact tetri", () => {
    expect(toTetri(0)).toBe(0);
    expect(toTetri(92.65)).toBe(9265);
    expect(toTetri(40.8)).toBe(4080);
    expect(toTetri(1284.6)).toBe(128460);
    expect(toTetri(0.01)).toBe(1);
  });

  test("absorbs binary noise instead of truncating it", () => {
    // Neither of these is exactly representable; `* 100` lands a hair off,
    // and truncating instead of rounding would lose a tetri.
    expect(0.29 * 100).not.toBe(29);
    expect(Math.trunc(0.29 * 100)).toBe(28);
    expect(toTetri(0.29)).toBe(29);
    expect(toTetri(0.57)).toBe(57);
    expect(toTetri(4.35)).toBe(435);
    expect(toTetri(19.99)).toBe(1999);
    expect(toTetri(0.1 + 0.2)).toBe(30);
  });

  test("is exact for every two-decimal amount up to ₾1,000", () => {
    // Collected and asserted once: 100,001 `expect` calls would dominate the
    // suite's run time.
    const wrong: number[] = [];

    for (let tetri = 0; tetri <= 100_000; tetri++) {
      if (toTetri(tetri / 100) !== tetri) {
        wrong.push(tetri);
      }
    }

    expect(wrong).toEqual([]);
  });

  test("rounds a value with more than two decimals to the nearest tetri, halves up", () => {
    expect(toTetri(1.234)).toBe(123);
    expect(toTetri(1.236)).toBe(124);
    expect(toTetri(0.125)).toBe(13);
  });

  test("throws rather than post a corrupt amount", () => {
    for (const bad of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) {
      expect(() => toTetri(bad)).toThrow(RangeError);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Ledger rules                                                              */
/* ------------------------------------------------------------------------- */

test.describe("the ledger", () => {
  test("credits are positive and a withdrawal is negative", () => {
    expect(signedEntryAmount("JOB_PAYOUT", 9265)).toBe(9265);
    expect(signedEntryAmount("JOB_OVERTIME", 892)).toBe(892);
    expect(signedEntryAmount("WITHDRAWAL_REVERSAL", 5000)).toBe(5000);
    expect(signedEntryAmount("WITHDRAWAL", 5000)).toBe(-5000);
  });

  test("an entry's magnitude must be a positive whole number", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => signedEntryAmount("JOB_PAYOUT", bad)).toThrow(RangeError);
    }
  });

  test("available is the balance minus what pending withdrawals reserve", () => {
    expect(walletBalances(14237, 8542)).toEqual({
      balanceTetri: 14237,
      reservedTetri: 8542,
      availableTetri: 5695,
    });
  });

  test("the schema makes job and withdrawal postings unique, and the migration matches", () => {
    const schema = readFileSync(join(REPO, "prisma", "schema.prisma"), "utf8");
    const model =
      /model WalletLedgerEntry \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";

    expect(model).toContain("@@unique([orderId, type])");
    expect(model).toContain("@@unique([withdrawalId, type])");

    const migration = readFileSync(
      join(
        REPO,
        "prisma",
        "migrations",
        "20261002210000_driver_wallet",
        "migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "WalletLedgerEntry_orderId_type_key" ON "WalletLedgerEntry"("orderId", "type")',
    );
    // Additive only: nothing dropped, nothing rewritten.
    expect(migration).not.toMatch(/\bDROP\s|\bTRUNCATE\b|^\s*DELETE\b/im);
  });

  test("the ledger is append-only: no code updates or deletes an entry", () => {
    for (const file of ["ledger.ts", "withdrawals.ts", "bank-accounts.ts"]) {
      const source = readFileSync(
        join(REPO, "src", "lib", "wallet", file),
        "utf8",
      );

      expect(source).not.toMatch(
        /walletLedgerEntry\.(update|updateMany|delete|deleteMany|upsert)\b/,
      );
    }
  });
});

test.describe("when a job credits the wallet", () => {
  const creditable = {
    orderStatus: "COMPLETED",
    paymentMethodType: "CARD",
    gatewayConfirmed: true,
    orderCompanyId: null,
    claimedAs: "INDEPENDENT" as DriverClaimCapacity | null,
    driver: { companyId: null },
  };

  test("a completed, gateway-confirmed card job of an independent driver credits", () => {
    expect(walletCreditDecisionFor(creditable)).toEqual({ kind: "CREDIT" });
  });

  test("not before completion, in any earlier status", () => {
    for (const orderStatus of [
      "PENDING",
      "ACCEPTED",
      "IN_TRANSIT",
      "CANCELLED",
    ]) {
      expect(walletCreditDecisionFor({ ...creditable, orderStatus })).toEqual({
        kind: "SKIP",
        reason: "NOT_COMPLETED",
      });
    }
  });

  test("not without a gateway confirmation — which is every job today", () => {
    expect(
      walletCreditDecisionFor({ ...creditable, gatewayConfirmed: false }),
    ).toEqual({ kind: "SKIP", reason: "NOT_GATEWAY_CONFIRMED" });
  });

  test("a cash job never credits, even if its payment were marked confirmed", () => {
    expect(
      walletCreditDecisionFor({ ...creditable, paymentMethodType: "CASH" }),
    ).toEqual({ kind: "SKIP", reason: "CASH" });
  });

  test("a company's job is owed to the company, whoever drove it", () => {
    expect(
      walletCreditDecisionFor({ ...creditable, orderCompanyId: "company" }),
    ).toEqual({ kind: "SKIP", reason: "COMPANY_JOB" });
    expect(
      walletCreditDecisionFor({
        ...creditable,
        orderCompanyId: "company",
        driver: { companyId: "company" },
      }),
    ).toEqual({ kind: "SKIP", reason: "COMPANY_JOB" });
  });

  test("a roster driver's self-claimed load is held, never credited", () => {
    expect(
      walletCreditDecisionFor({
        ...creditable,
        claimedAs: "ROSTER",
        driver: { companyId: "employer" },
      }),
    ).toEqual({ kind: "HOLD", reason: "ROSTER_SELF_CLAIM" });
  });

  test("a job claimed on a roster is held even after the driver has left the company", () => {
    // The defect this record exists for: claimed while employed, removed from
    // the roster, and only then confirmed by the gateway. Read from the roster
    // at credit time, this credited the driver personally.
    expect(
      walletCreditDecisionFor({
        ...creditable,
        claimedAs: "ROSTER",
        driver: { companyId: null },
      }),
    ).toEqual({ kind: "HOLD", reason: "ROSTER_SELF_CLAIM" });
  });

  test("an independently claimed job is still held while its driver is on a roster", () => {
    // A roster driver has no wallet to credit; the record never turns a hold
    // into a credit, it only adds a reason to hold.
    expect(
      walletCreditDecisionFor({
        ...creditable,
        claimedAs: "INDEPENDENT",
        driver: { companyId: "employer" },
      }),
    ).toEqual({ kind: "HOLD", reason: "ROSTER_SELF_CLAIM" });
  });

  test("a job claimed before the record existed is decided by the roster today", () => {
    expect(walletCreditDecisionFor({ ...creditable, claimedAs: null })).toEqual(
      { kind: "CREDIT" },
    );
    expect(
      walletCreditDecisionFor({
        ...creditable,
        claimedAs: null,
        driver: { companyId: "employer" },
      }),
    ).toEqual({ kind: "HOLD", reason: "ROSTER_SELF_CLAIM" });
  });

  test("the claim record outranks nothing above it", () => {
    // Completion, confirmation, cash and company jobs are all decided first.
    expect(
      walletCreditDecisionFor({
        ...creditable,
        claimedAs: "ROSTER",
        gatewayConfirmed: false,
      }),
    ).toEqual({ kind: "SKIP", reason: "NOT_GATEWAY_CONFIRMED" });
    expect(
      walletCreditDecisionFor({
        ...creditable,
        claimedAs: "ROSTER",
        orderCompanyId: "company",
      }),
    ).toEqual({ kind: "SKIP", reason: "COMPANY_JOB" });
  });

  test("an order with no driver profile credits nobody", () => {
    expect(walletCreditDecisionFor({ ...creditable, driver: null })).toEqual({
      kind: "SKIP",
      reason: "NO_DRIVER",
    });
  });

  test("the confirmation is its own column, not the PAID flag or the provider", () => {
    const ledger = readFileSync(
      join(REPO, "src", "lib", "wallet", "ledger.ts"),
      "utf8",
    );

    expect(ledger).toContain("gatewayConfirmedAt");
    // The crediting function never reads the payment's status or provider.
    expect(ledger).not.toMatch(
      /PaymentStatus|payment:\s*\{\s*select:\s*\{[^}]*\b(status|provider)\b/,
    );
  });

  test("no API route can confirm a payment — only the seam and the local script", () => {
    const confirmation = readFileSync(
      join(REPO, "src", "lib", "orders", "gateway-confirmation.ts"),
      "utf8",
    );
    const script = readFileSync(
      join(REPO, "scripts", "simulate-gateway-payment.ts"),
      "utf8",
    );
    const payRoute = readFileSync(
      join(REPO, "src", "app", "api", "orders", "[id]", "pay", "route.ts"),
      "utf8",
    );

    expect(confirmation).toContain('"none"');
    expect(script).toContain("assertLocalDatabase();");
    // Checkout — the only route that writes a `Payment` — sets none of the
    // gateway columns and does not call the confirmation.
    expect(payRoute).not.toMatch(/gatewayConfirmedAt|confirmGatewayPayment/);
  });
});

/* ------------------------------------------------------------------------- */
/* Withdrawals                                                               */
/* ------------------------------------------------------------------------- */

test.describe("requesting a withdrawal", () => {
  const ok = {
    amountTetri: 5000,
    availableTetri: 14237,
    isSuspended: false,
    accountStatus: "VERIFIED" as const,
  };

  test("is accepted between the minimum and the available balance, inclusive", () => {
    expect(withdrawalRefusalFor(ok)).toBeNull();
    expect(withdrawalRefusalFor({ ...ok, amountTetri: 1000 })).toBeNull();
    expect(withdrawalRefusalFor({ ...ok, amountTetri: 14237 })).toBeNull();
  });

  test("is refused below ₾10.00", () => {
    expect(withdrawalRefusalFor({ ...ok, amountTetri: 999 })).toBe(
      "BELOW_MINIMUM",
    );
  });

  test("is refused one tetri above what is available", () => {
    expect(withdrawalRefusalFor({ ...ok, amountTetri: 14238 })).toBe(
      "INSUFFICIENT_FUNDS",
    );
  });

  test("is refused to a pending or rejected account", () => {
    for (const accountStatus of ["PENDING", "REJECTED"] as const) {
      expect(withdrawalRefusalFor({ ...ok, accountStatus })).toBe(
        "BANK_ACCOUNT_NOT_VERIFIED",
      );
    }
  });

  test("a suspended driver's wallet is frozen, whatever else is true", () => {
    expect(withdrawalRefusalFor({ ...ok, isSuspended: true })).toBe(
      "WALLET_FROZEN",
    );
    expect(
      withdrawalRefusalFor({ ...ok, isSuspended: true, amountTetri: 1 }),
    ).toBe("WALLET_FROZEN");
  });

  test("the summary explains why withdrawing is not possible", () => {
    const wallet = {
      availableTetri: 5000,
      isSuspended: false,
      hasVerifiedAccount: true,
    };

    expect(withdrawBlockedReasonFor(wallet)).toBeNull();
    expect(withdrawBlockedReasonFor({ ...wallet, isSuspended: true })).toBe(
      "WALLET_FROZEN",
    );
    expect(
      withdrawBlockedReasonFor({ ...wallet, hasVerifiedAccount: false }),
    ).toBe("NO_VERIFIED_BANK_ACCOUNT");
    expect(withdrawBlockedReasonFor({ ...wallet, availableTetri: 999 })).toBe(
      "BELOW_MINIMUM",
    );
    // Today's state for everyone: nothing credited, no account.
    expect(
      withdrawBlockedReasonFor({
        availableTetri: 0,
        isSuspended: false,
        hasVerifiedAccount: false,
      }),
    ).toBe("NO_VERIFIED_BANK_ACCOUNT");
  });
});

test.describe("a manual adjustment", () => {
  test("may credit any amount and debit up to what is available", () => {
    expect(
      adjustmentRefusalFor({ amountTetri: 500, availableTetri: 0 }),
    ).toBeNull();
    expect(
      adjustmentRefusalFor({ amountTetri: -500, availableTetri: 500 }),
    ).toBeNull();
    expect(
      adjustmentRefusalFor({ amountTetri: -501, availableTetri: 500 }),
    ).toBe("EXCEEDS_AVAILABLE");
  });

  test("must be a non-zero whole number of tetri within bounds", () => {
    for (const amountTetri of [0, 1.5, Number.NaN, 100_000_001, -100_000_001]) {
      expect(adjustmentRefusalFor({ amountTetri, availableTetri: 1e12 })).toBe(
        "INVALID_AMOUNT",
      );
    }
  });
});

test("required text is trimmed, and refused when empty, too long or not a string", () => {
  expect(parseRequiredText("  ref 1  ", 10)).toBe("ref 1");
  expect(parseRequiredText("   ", 10)).toBeNull();
  expect(parseRequiredText("x".repeat(11), 10)).toBeNull();
  expect(parseRequiredText(42, 10)).toBeNull();
  expect(parseRequiredText(undefined, 10)).toBeNull();
});

test("the page size defaults to 20 and is capped at 50", () => {
  expect(parsePageSize(null)).toBe(20);
  expect(parsePageSize("abc")).toBe(20);
  expect(parsePageSize("0")).toBe(20);
  expect(parsePageSize("5")).toBe(5);
  expect(parsePageSize("500")).toBe(50);
});

/* ------------------------------------------------------------------------- */
/* The wire                                                                  */
/* ------------------------------------------------------------------------- */

test.describe("wallet serializers", () => {
  /** Every key at any depth. */
  function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
    if (Array.isArray(value)) {
      value.forEach((item) => allKeys(item, keys));
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        allKeys(child, keys);
      }
    }

    return keys;
  }

  const account = {
    id: "acct",
    bank: "TBC" as const,
    bankName: "TBC Bank",
    iban: "GE35TB0000000000004417",
    maskedIban: "GE35 TB•• •••• •••• 4417",
    accountHolderName: "Nino Abashidze",
    status: "VERIFIED" as const,
    rejectionReason: null,
    isDefault: true,
    createdAt: "2026-10-02T10:00:00.000Z",
  };

  test("an entry is an allowlist: a smuggled client price never reaches the wire", () => {
    const record = {
      id: "entry",
      type: "JOB_PAYOUT" as const,
      amountTetri: 9265,
      createdAt: "2026-10-02T10:00:00.000Z",
      job: {
        id: "order",
        reference: "GE-48177",
        price: 109,
        commissionRate: 0.15,
      },
      withdrawal: null,
      note: null,
      price: 109,
      commissionRate: 0.15,
    };

    const entry = toWalletEntry(record);

    expect(entry).toEqual({
      id: "entry",
      type: "JOB_PAYOUT",
      amountTetri: 9265,
      createdAt: "2026-10-02T10:00:00.000Z",
      job: { id: "order", reference: "GE-48177" },
      withdrawal: null,
      note: null,
    });
    expect(
      [...allKeys(entry)].filter((key) =>
        /price|fare|fee|commission/i.test(key),
      ),
    ).toEqual([]);
  });

  test("a withdrawal does not say who decided it", () => {
    const withdrawal = toWalletWithdrawal({
      id: "wd",
      amountTetri: 5000,
      status: "PAID",
      bankAccountId: "acct",
      bank: "TBC",
      bankName: "TBC Bank",
      maskedIban: "GE35 TB•• •••• •••• 4417",
      bankReference: "REF-1",
      rejectionReason: null,
      requestedAt: "2026-10-02T10:00:00.000Z",
      decidedAt: "2026-10-02T11:00:00.000Z",
      ...{ decidedById: "staff", reversalReason: "internal" },
    });

    expect(Object.keys(withdrawal).sort()).toEqual([
      "amountTetri",
      "bank",
      "bankAccountId",
      "bankName",
      "bankReference",
      "decidedAt",
      "id",
      "maskedIban",
      "rejectionReason",
      "requestedAt",
      "status",
    ]);
  });

  test("the summary derives canWithdraw from the blocked reason", () => {
    const base = {
      balanceTetri: 14237,
      availableTetri: 5695,
      pendingWithdrawalsTetri: 8542,
      pendingWithdrawalCount: 1,
      minimumWithdrawalTetri: 1000,
      bankAccountLimit: 3,
      defaultBankAccount: account,
    };

    expect(
      toWalletSummaryResponse({ ...base, withdrawBlockedReason: null }),
    ).toMatchObject({
      currency: "GEL",
      canWithdraw: true,
      withdrawBlockedReason: null,
      defaultBankAccount: toWalletBankAccount(account),
    });
    expect(
      toWalletSummaryResponse({
        ...base,
        withdrawBlockedReason: "WALLET_FROZEN",
        defaultBankAccount: null,
      }),
    ).toMatchObject({
      canWithdraw: false,
      withdrawBlockedReason: "WALLET_FROZEN",
      defaultBankAccount: null,
    });
  });
});

test("the rules module has no runtime imports", () => {
  const source = readFileSync(
    join(REPO, "src", "lib", "wallet", "rules.ts"),
    "utf8",
  );

  expect(source).not.toMatch(/^import\s/m);
});

test.describe("whose job it was is recorded at the claim", () => {
  const read = (...segments: string[]) =>
    readFileSync(join(REPO, ...segments), "utf8");

  test("the claiming write stamps the capacity onto the order", () => {
    // One statement claims the order and records it, so an order can never be
    // claimed without the record the wallet later decides on.
    const claim = read("src", "lib", "orders", "driver-claim.ts");
    const write = claim.slice(claim.indexOf("prisma.order.updateMany("));

    expect(write).toContain("driverClaimedAs:");
    expect(write).toContain("driverClaimCompanyId: driverProfile.companyId");
    expect(write.indexOf("driverClaimedAs:")).toBeLessThan(
      write.indexOf("if (count === 0)"),
    );
  });

  test("the ledger decides on that record, not only on the roster today", () => {
    const ledger = read("src", "lib", "wallet", "ledger.ts");

    expect(ledger).toContain("claimedAs: order.driverClaimedAs");
  });

  test("the schema carries both columns, nullable for older orders", () => {
    const schema = read("prisma", "schema.prisma");

    expect(schema).toMatch(/driverClaimedAs\s+DriverClaimCapacity\?/);
    expect(schema).toMatch(/driverClaimCompanyId\s+String\?/);
  });
});

test.describe("a withdrawal request must carry a requestKey", () => {
  const route = readFileSync(
    join(
      REPO,
      "src",
      "app",
      "api",
      "dashboard",
      "hub",
      "wallet",
      "withdrawals",
      "route.ts",
    ),
    "utf8",
  );

  test("a request without one is refused before anything is reserved", () => {
    // Optional, a double tap from a client that left it out reserved twice.
    const refusal = route.indexOf('t("errors.wallet.requestKeyRequired"');
    const reserve = route.indexOf("await requestWithdrawal(");

    expect(refusal).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(reserve);
    expect(route).toContain(
      "if (requestKey === undefined || requestKey === null)",
    );
  });

  test("the reservation takes the key as a string, never null", () => {
    const withdrawals = readFileSync(
      join(REPO, "src", "lib", "wallet", "withdrawals.ts"),
      "utf8",
    );

    expect(withdrawals).toMatch(
      /requestKey: string;\n\}\): Promise<RequestWithdrawalOutcome>/,
    );
    expect(withdrawals).not.toContain("requestKey: string | null");
  });

  test("the contract says so", () => {
    const contracts = readFileSync(
      join(REPO, "src", "lib", "mobile-api", "contracts.ts"),
      "utf8",
    );
    const request = contracts.slice(
      contracts.indexOf("export type WalletWithdrawalRequest"),
      contracts.indexOf("export type WalletWithdrawalResponse"),
    );

    expect(request).toContain("requestKey: string;");
    expect(request).not.toContain("requestKey?:");
  });
});
