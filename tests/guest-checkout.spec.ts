/**
 * Guest checkout's pure rules: the contact a guest must leave, the token that
 * proves they booked an order, and the pay-body rules that depend on who is
 * paying (guest, INDIVIDUAL client, BUSINESS client).
 *
 * **No browser, no server, no database**, like `tests/order-input.spec.ts`.
 * Every module under test is a pure function of its input (and, for the pay
 * parser, a translator): `guest-contact.ts`, `pay-input.ts` and
 * `card-metadata.ts` import no Prisma client, and `guest-access.ts` only
 * touches request cookies inside the two helpers not exercised here.
 *
 * The translator is a fake that echoes its key, and every key it is asked for
 * is checked against the English catalog, so a typo'd key fails here rather
 * than rendering as a raw key to a customer.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import type { RequestTranslator } from "@/i18n/request-locale";
import {
  createGuestAccessToken,
  GUEST_ORDER_COOKIE_PREFIX,
  guestOrderCookieName,
  guestTokenWhere,
  hashGuestAccessToken,
  isGuestAccessTokenShape,
  orderAccessWhere,
} from "@/lib/orders/guest-access";
import {
  GUEST_NAME_MAX_LENGTH,
  parseGuestContact,
} from "@/lib/orders/guest-contact";
import { orderClientDisplay } from "@/lib/orders/order-client-display";
import { parsePayOrderBody, type PayerKind } from "@/lib/orders/pay-input";
import {
  CARD_DETAILS_REJECTED_KEY,
  containsCardDetails,
} from "@/lib/payments/card-metadata";

const EN_MESSAGES: Record<string, unknown> = Object.fromEntries(
  ["errors", "common"].map((namespace) => [
    namespace,
    JSON.parse(
      readFileSync(
        join(process.cwd(), "src", "messages", "en", `${namespace}.json`),
        "utf8",
      ),
    ),
  ]),
);

function catalogHas(key: string): boolean {
  let node: unknown = EN_MESSAGES;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

const requestedKeys = new Set<string>();

const fakeT = ((key: string) => {
  requestedKeys.add(key);
  return key;
}) as unknown as RequestTranslator;

/** A fixed "now" so card expiry checks do not drift with the calendar. */
const NOW = new Date("2026-10-13T12:00:00Z");

const VALID_CONTACT = {
  firstName: "  Nino ",
  lastName: "Beridze",
  phone: "555 12 34 56",
  email: "",
};

const VALID_CARD = {
  brand: "Visa",
  last4: "4242",
  expMonth: 12,
  expYear: 2028,
  holderName: "NINO BERIDZE",
};

function pay(body: unknown, payer: PayerKind) {
  return parsePayOrderBody(body, payer, fakeT, NOW);
}

function refusal(body: unknown, payer: PayerKind): string {
  const result = pay(body, payer);
  if (!("error" in result)) {
    throw new Error("expected the body to be refused, but it was accepted");
  }
  return result.error;
}

test.afterAll(() => {
  for (const key of requestedKeys) {
    expect(catalogHas(key), `missing catalog key ${key}`).toBe(true);
  }
});

test.describe("parseGuestContact", () => {
  test("accepts a complete contact, trims it and stores the phone as E.164", () => {
    expect(parseGuestContact(VALID_CONTACT)).toEqual({
      data: {
        firstName: "Nino",
        lastName: "Beridze",
        phone: "+995555123456",
        email: null,
      },
    });
  });

  test("keeps an optional email when it is shaped like one", () => {
    const result = parseGuestContact({
      ...VALID_CONTACT,
      email: " nino@example.ge ",
    });
    expect("data" in result && result.data.email).toBe("nino@example.ge");
  });

  test("reports every missing required field at once", () => {
    expect(parseGuestContact({})).toEqual({
      errors: {
        firstName: "required",
        lastName: "required",
        phone: "required",
      },
    });
    expect(parseGuestContact(null)).toEqual({
      errors: {
        firstName: "required",
        lastName: "required",
        phone: "required",
      },
    });
  });

  test("treats blank names as missing", () => {
    expect(
      parseGuestContact({ ...VALID_CONTACT, firstName: "   ", lastName: "" }),
    ).toEqual({ errors: { firstName: "required", lastName: "required" } });
  });

  test("refuses an over-long name", () => {
    expect(
      parseGuestContact({
        ...VALID_CONTACT,
        lastName: "x".repeat(GUEST_NAME_MAX_LENGTH + 1),
      }),
    ).toEqual({ errors: { lastName: "invalid" } });
  });

  test("refuses a phone that cannot be normalised", () => {
    expect(parseGuestContact({ ...VALID_CONTACT, phone: "12345" })).toEqual({
      errors: { phone: "invalid" },
    });
  });

  test("refuses a malformed email but not a missing one", () => {
    expect(
      parseGuestContact({ ...VALID_CONTACT, email: "not-an-email" }),
    ).toEqual({ errors: { email: "invalid" } });
    expect(parseGuestContact({ ...VALID_CONTACT, email: 42 })).toEqual({
      errors: { email: "invalid" },
    });
    expect("data" in parseGuestContact({ ...VALID_CONTACT, email: null })).toBe(
      true,
    );
  });
});

test.describe("guest access tokens", () => {
  test("mints a 43-character base64url token and its sha256 hex hash", () => {
    const { token, hash } = createGuestAccessToken();
    expect(isGuestAccessTokenShape(token)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestAccessToken(token)).toBe(hash);
  });

  test("mints a different token every time", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createGuestAccessToken().token),
    );
    expect(tokens.size).toBe(50);
  });

  test("hashes deterministically", () => {
    // sha256("abc")
    expect(hashGuestAccessToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("rejects values that cannot be a minted token", () => {
    expect(isGuestAccessTokenShape("")).toBe(false);
    expect(isGuestAccessTokenShape("a".repeat(42))).toBe(false);
    expect(isGuestAccessTokenShape(`${"a".repeat(42)}=`)).toBe(false);
  });

  test("names one cookie per order", () => {
    expect(guestOrderCookieName("cord1")).toBe(
      `${GUEST_ORDER_COOKIE_PREFIX}cord1`,
    );
  });

  test("scopes a client to their own orders", () => {
    expect(orderAccessWhere("o1", { kind: "client", userId: "u1" })).toEqual({
      id: "o1",
      clientId: "u1",
    });
  });

  test("scopes a guest to guest orders carrying their token's hash", () => {
    const { token, hash } = createGuestAccessToken();
    expect(orderAccessWhere("o1", { kind: "guest", token })).toEqual({
      id: "o1",
      clientId: null,
      guestAccessTokenHash: hash,
    });
    expect(guestTokenWhere(token)).toEqual({
      clientId: null,
      guestAccessTokenHash: hash,
    });
  });
});

test.describe("parsePayOrderBody — guest", () => {
  test("accepts a card payment with a contact and a one-off card", () => {
    expect(
      pay(
        {
          paymentMethodType: "CARD",
          guestContact: VALID_CONTACT,
          card: VALID_CARD,
          purchaseOrderRef: "PO-1",
        },
        "GUEST",
      ),
    ).toEqual({
      data: {
        paymentMethodType: "CARD",
        savedCardId: null,
        purchaseOrderRef: null,
        guestContact: {
          firstName: "Nino",
          lastName: "Beridze",
          phone: "+995555123456",
          email: null,
        },
        card: {
          brand: "Visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2028,
          holderName: "NINO BERIDZE",
        },
      },
    });
  });

  test("refuses Pay later", () => {
    expect(
      refusal(
        { paymentMethodType: "CASH", guestContact: VALID_CONTACT },
        "GUEST",
      ),
    ).toBe("errors.ordersPay.payLaterIsNotAvailable");
  });

  test("refuses a missing or incomplete contact with field errors", () => {
    const result = pay(
      { paymentMethodType: "CARD", card: VALID_CARD },
      "GUEST",
    );
    expect(result).toEqual({
      error: "errors.ordersPay.enterYourContactDetails",
      fieldErrors: {
        firstName: "required",
        lastName: "required",
        phone: "required",
      },
    });

    const badPhone = pay(
      {
        paymentMethodType: "CARD",
        card: VALID_CARD,
        guestContact: { ...VALID_CONTACT, phone: "abc" },
      },
      "GUEST",
    );
    expect("fieldErrors" in badPhone && badPhone.fieldErrors).toEqual({
      phone: "invalid",
    });
  });

  test("requires the one-off card", () => {
    expect(
      refusal(
        { paymentMethodType: "CARD", guestContact: VALID_CONTACT },
        "GUEST",
      ),
    ).toBe("errors.ordersPay.enterTheCardYouArePaying");
  });

  test("refuses a saved card — a guest has no wallet", () => {
    expect(
      refusal(
        {
          paymentMethodType: "CARD",
          savedCardId: "card1",
          guestContact: VALID_CONTACT,
          card: VALID_CARD,
        },
        "GUEST",
      ),
    ).toBe("common.shared.chooseACardSavedToYour");
  });

  test("validates the card like a saved card", () => {
    const base = { paymentMethodType: "CARD", guestContact: VALID_CONTACT };
    expect(
      refusal({ ...base, card: { ...VALID_CARD, last4: "42" } }, "GUEST"),
    ).toBe("errors.savedCards.enterAFourDigitCardEnding");
    expect(
      refusal(
        { ...base, card: { ...VALID_CARD, expMonth: 9, expYear: 2026 } },
        "GUEST",
      ),
    ).toBe("errors.savedCards.thatCardHasExpiredAddA");
    expect(
      refusal({ ...base, card: { ...VALID_CARD, brand: "" } }, "GUEST"),
    ).toBe("errors.savedCards.enterTheCardBrand");
  });

  test("refuses a card object carrying a full number or security code", () => {
    const base = { paymentMethodType: "CARD", guestContact: VALID_CONTACT };
    expect(
      refusal({ ...base, card: { ...VALID_CARD, cvc: "123" } }, "GUEST"),
    ).toBe(CARD_DETAILS_REJECTED_KEY);
    expect(
      refusal(
        { ...base, card: { ...VALID_CARD, holderName: "4111 1111 1111 1111" } },
        "GUEST",
      ),
    ).toBe(CARD_DETAILS_REJECTED_KEY);
  });

  test("does not mistake the guest's phone for a card number", () => {
    expect(containsCardDetails(VALID_CARD)).toBe(false);
    const result = pay(
      {
        paymentMethodType: "CARD",
        guestContact: { ...VALID_CONTACT, phone: "+995555123456" },
        card: VALID_CARD,
      },
      "GUEST",
    );
    expect("data" in result).toBe(true);
  });
});

test.describe("parsePayOrderBody — account payers", () => {
  test("refuses Pay later from an INDIVIDUAL client", () => {
    expect(refusal({ paymentMethodType: "CASH" }, "INDIVIDUAL")).toBe(
      "errors.ordersPay.payLaterIsNotAvailable",
    );
  });

  test("lets a BUSINESS client pay later, keeping the PO reference", () => {
    expect(
      pay(
        { paymentMethodType: "CASH", purchaseOrderRef: " PO-7 " },
        "BUSINESS",
      ),
    ).toEqual({
      data: {
        paymentMethodType: "CASH",
        savedCardId: null,
        purchaseOrderRef: "PO-7",
        guestContact: null,
        card: null,
      },
    });
  });

  test("drops an INDIVIDUAL client's PO reference instead of refusing", () => {
    const result = pay(
      {
        paymentMethodType: "CARD",
        savedCardId: "card1",
        purchaseOrderRef: "PO-7",
      },
      "INDIVIDUAL",
    );
    expect("data" in result && result.data.purchaseOrderRef).toBeNull();
  });

  test("still requires a saved card to pay by card", () => {
    expect(refusal({ paymentMethodType: "CARD" }, "INDIVIDUAL")).toBe(
      "common.shared.chooseASavedCardToPay",
    );
    expect(
      refusal({ paymentMethodType: "CASH", savedCardId: "c1" }, "BUSINESS"),
    ).toBe("common.shared.sendSavedcardidOnlyWhenPaymentmethodtypeIs");
  });

  test("ignores guest-only fields from an account payer", () => {
    const result = pay(
      {
        paymentMethodType: "CARD",
        savedCardId: "card1",
        guestContact: VALID_CONTACT,
        card: VALID_CARD,
      },
      "BUSINESS",
    );
    expect("data" in result && result.data.guestContact).toBeNull();
    expect("data" in result && result.data.card).toBeNull();
  });

  test("refuses an unknown method and a non-object body", () => {
    expect(refusal({ paymentMethodType: "BANK_TRANSFER" }, "BUSINESS")).toBe(
      "errors.ordersPay.paymentMethodTypeMustBeOneOf",
    );
    expect(refusal([], "GUEST")).toBe("common.shared.requestBodyMustBeAJson");
  });
});

test.describe("orderClientDisplay", () => {
  const noGuest = {
    guestFirstName: null,
    guestLastName: null,
    guestPhone: null,
    guestEmail: null,
  };

  test("shows the account for an account order", () => {
    expect(
      orderClientDisplay({
        ...noGuest,
        client: { name: "Giorgi", email: "g@example.ge" },
      }),
    ).toEqual({
      isGuest: false,
      name: "Giorgi",
      email: "g@example.ge",
      phone: null,
    });
  });

  test("shows the guest's contact for a guest order", () => {
    expect(
      orderClientDisplay({
        client: null,
        guestFirstName: "Nino",
        guestLastName: "Beridze",
        guestPhone: "+995555123456",
        guestEmail: null,
      }),
    ).toEqual({
      isGuest: true,
      name: "Nino Beridze",
      email: null,
      phone: "+995555123456",
    });
  });

  test("has no name for a guest who has not reached checkout", () => {
    expect(orderClientDisplay({ ...noGuest, client: null }).name).toBeNull();
  });
});
