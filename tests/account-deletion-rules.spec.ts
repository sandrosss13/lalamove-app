/**
 * The rules of self-service account deletion, pinned without a server or a
 * database: when a deletion is refused, exactly what the anonymised `User` and
 * `ClientProfile` rows contain, and the confirmation word.
 *
 * `src/lib/account-deletion/rules.ts` is the single statement of each — the
 * route, the `/account` card and the transaction in `server.ts` ask it.
 */

import { expect, test } from "@playwright/test";

import { normalizePhoneNumber } from "@/lib/phone-number";
import {
  ACCOUNT_DELETION_CONFIRMATION_WORDS,
  ACTIVE_ORDER_STATUSES,
  DELETED_ACCOUNT_EMAIL_DOMAIN,
  DELETED_ACCOUNT_NAME,
  accountDeletionRefusal,
  buildAnonymisedClientProfileData,
  buildAnonymisedUserData,
  deletedAccountEmail,
  deletedAccountPhone,
  isAccountDeletionConfirmed,
  isDeletedAccountPlaceholderEmail,
} from "@/lib/account-deletion/rules";

test.describe("accountDeletionRefusal", () => {
  test("allows a client with no active orders and no balance", () => {
    expect(
      accountDeletionRefusal({ activeOrderCount: 0, walletBalanceTetri: 0 }),
    ).toBeNull();
  });

  test("refuses while any order is active", () => {
    expect(
      accountDeletionRefusal({ activeOrderCount: 1, walletBalanceTetri: 0 }),
    ).toBe("ACTIVE_ORDERS");
  });

  test("refuses on a non-zero balance in either direction", () => {
    expect(
      accountDeletionRefusal({ activeOrderCount: 0, walletBalanceTetri: 500 }),
    ).toBe("WALLET_BALANCE");
    expect(
      accountDeletionRefusal({ activeOrderCount: 0, walletBalanceTetri: -1 }),
    ).toBe("WALLET_BALANCE");
  });

  test("reports active orders first when both apply", () => {
    expect(
      accountDeletionRefusal({ activeOrderCount: 2, walletBalanceTetri: 10 }),
    ).toBe("ACTIVE_ORDERS");
  });

  test("active means on the board or under way — INITIATED is cancelled instead", () => {
    expect([...ACTIVE_ORDER_STATUSES].sort()).toEqual(
      ["ACCEPTED", "CLAIMED", "IN_TRANSIT", "PENDING"].sort(),
    );
    expect(ACTIVE_ORDER_STATUSES).not.toContain("INITIATED");
    expect(ACTIVE_ORDER_STATUSES).not.toContain("COMPLETED");
    expect(ACTIVE_ORDER_STATUSES).not.toContain("CANCELLED");
  });
});

test.describe("anonymisation payloads", () => {
  const userId = "cm1abcdefghijklmnop";
  const now = new Date("2026-10-23T10:00:00.000Z");

  test("User: every personal column replaced, deactivatedAt set", () => {
    expect(buildAnonymisedUserData(userId, now)).toEqual({
      name: DELETED_ACCOUNT_NAME,
      email: `deleted+${userId}@${DELETED_ACCOUNT_EMAIL_DOMAIN}`,
      emailVerified: false,
      image: null,
      phoneNumber: null,
      phoneNumberVerified: false,
      deactivatedAt: now,
    });
  });

  test("ClientProfile: personal fields nulled, phone replaced", () => {
    expect(buildAnonymisedClientProfileData(userId)).toEqual({
      firstName: null,
      lastName: null,
      companyName: null,
      vatId: null,
      legalAddress: null,
      phone: `deleted:${userId}`,
      dateOfBirth: null,
      gender: null,
      idNumber: null,
    });
  });

  test("payloads never touch role, account type or moderation columns", () => {
    const user = buildAnonymisedUserData(userId, now);
    for (const key of ["role", "isSuspended", "suspendedReason", "id"]) {
      expect(user).not.toHaveProperty(key);
    }
    expect(buildAnonymisedClientProfileData(userId)).not.toHaveProperty(
      "accountType",
    );
  });

  test("deterministic per user, distinct across users (idempotent, unique)", () => {
    expect(buildAnonymisedUserData(userId, now)).toEqual(
      buildAnonymisedUserData(userId, now),
    );
    expect(deletedAccountEmail("a")).not.toBe(deletedAccountEmail("b"));
    expect(deletedAccountPhone("a")).not.toBe(deletedAccountPhone("b"));
  });

  test("the phone placeholder can never be a real number", () => {
    const placeholder = deletedAccountPhone(userId);
    expect(placeholder).not.toMatch(/^\+?\d+$/);
    expect(normalizePhoneNumber(placeholder)).not.toBe(placeholder);
  });

  test("the email placeholder is on a reserved, non-routable domain", () => {
    expect(DELETED_ACCOUNT_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
    expect(isDeletedAccountPlaceholderEmail(deletedAccountEmail(userId))).toBe(
      true,
    );
    expect(isDeletedAccountPlaceholderEmail(" X@Deleted.Zomo.Invalid ")).toBe(
      true,
    );
    expect(isDeletedAccountPlaceholderEmail("someone@zomo.ge")).toBe(false);
    expect(isDeletedAccountPlaceholderEmail(undefined)).toBe(false);
  });
});

test.describe("isAccountDeletionConfirmed", () => {
  test("accepts either locale's word, trimmed", () => {
    expect(
      isAccountDeletionConfirmed(ACCOUNT_DELETION_CONFIRMATION_WORDS.en),
    ).toBe(true);
    expect(
      isAccountDeletionConfirmed(ACCOUNT_DELETION_CONFIRMATION_WORDS.ka),
    ).toBe(true);
    expect(isAccountDeletionConfirmed("  DELETE ")).toBe(true);
  });

  test("refuses anything else", () => {
    expect(isAccountDeletionConfirmed("delete")).toBe(false);
    expect(isAccountDeletionConfirmed("")).toBe(false);
    expect(isAccountDeletionConfirmed(true)).toBe(false);
    expect(isAccountDeletionConfirmed(undefined)).toBe(false);
  });
});
