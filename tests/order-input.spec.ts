/**
 * The booking body parser, now that two routes depend on it.
 *
 * `parseCreateOrderBody` used to be private to `POST /api/orders`. It moved to
 * `src/lib/orders/order-input.ts` so `PATCH /api/orders/[id]` — a client
 * editing an unpaid order — holds an edit to exactly the rules a booking is
 * held to. That makes it load-bearing twice over, and it had no test at all:
 * every rule below was enforced only by the route's own handler, exercised only
 * by hand.
 *
 * **Why this runs with no browser, no server and no database**, like
 * `tests/class-substitution.spec.ts`. The parser is a pure function of a body
 * and a translator. Its module is deliberately free of `server-only` for this
 * reason (see its header); its one transitive Prisma import, through
 * `parseQuoteFields`, is a client instance that nothing on this path ever
 * queries, so nothing here connects anywhere.
 *
 * **The translator is a fake that echoes its key.** What a route returns is
 * `t(key, values)`, so asserting on the key is asserting on *which* refusal the
 * client gets — the stable fact — without pinning English copy that is free to
 * change. Each key the fake is asked for is also checked against the English
 * catalog, so a typo'd key (which `next-intl` would render as the raw key, in
 * production, to a customer) fails here instead.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import type { RequestTranslator } from "@/i18n/request-locale";
import {
  parseCreateOrderBody,
  resolveGeorgianCity,
} from "@/lib/orders/order-input";

/** Every catalog key resolvable through `getRequestTranslations()`. */
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

/** Keys asked for, so each test can assert the catalog has them. */
const requestedKeys = new Set<string>();

/**
 * Echoes `key` — the whole dotted path the route would localise. Cast because
 * next-intl's translator type is a deeply generic overload set that a fake has
 * no reason to reproduce; the parser only ever calls it as `t(key, values?)`.
 */
const fakeT = ((key: string) => {
  requestedKeys.add(key);
  return key;
}) as unknown as RequestTranslator;

/** A body the booking form could actually send, scheduled safely in the future. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    pickupAddress: "1 Rustaveli Avenue, Tbilisi, Georgia",
    dropoffAddress: "5 Station Square, Rustavi, Georgia",
    cargoCategory: "FURNITURE_FURNISHINGS",
    vehicleTypeCode: "BOX_TRUCK",
    helperCount: 1,
    serviceLevel: "PRIORITY",
    ...overrides,
  };
}

/** The error key a body is refused with, or a failure if it was accepted. */
function refusal(body: unknown): string {
  const result = parseCreateOrderBody(body, fakeT);
  if (!("error" in result)) {
    throw new Error("expected the body to be refused, but it was accepted");
  }
  return result.error;
}

test.describe("parseCreateOrderBody", () => {
  test.afterEach(() => {
    for (const key of requestedKeys) {
      expect(catalogHas(key), `missing catalog key ${key}`).toBe(true);
    }
    requestedKeys.clear();
  });

  test("accepts the booking form's own body and fills the documented defaults", () => {
    const result = parseCreateOrderBody(
      validBody({ serviceLevel: undefined, description: "   " }),
      fakeT,
    );
    if ("error" in result) throw new Error(result.error);

    expect(result.data).toMatchObject({
      vehicleTypeCode: "BOX_TRUCK",
      helperCount: 1,
      // An omitted tier is Regular, the column's own default.
      serviceLevel: "REGULAR",
      bodyType: null,
      paymentMethodType: null,
      savedCardId: null,
      purchaseOrderRef: null,
      // A skipped contact dialog is an empty contact, not an error.
      pickupContact: { name: null, phone: null, details: null },
      dropoffContact: { name: null, phone: null, details: null },
      // The envelope is all-or-nothing, and nothing is the normal case.
      cargoWeightKg: null,
      cargoLengthM: null,
      cargoWidthM: null,
      cargoHeightM: null,
      handlingTags: [],
      pickupWindowStart: null,
      pickupWindowEnd: null,
      deliveryDeadline: null,
    });
    // Blank collapses to absent — the edit route turns this into an explicit
    // `null` so a cleared description actually clears.
    expect(result.data.description).toBeUndefined();
    expect(result.data.scheduledAt).toBeInstanceOf(Date);
  });

  test("trims stop contacts and keeps them", () => {
    const result = parseCreateOrderBody(
      validBody({
        pickupContact: { name: "  Nino  ", phone: "555 12 34 56", details: "" },
      }),
      fakeT,
    );
    if ("error" in result) throw new Error(result.error);

    expect(result.data.pickupContact).toEqual({
      name: "Nino",
      phone: "555 12 34 56",
      details: null,
    });
  });

  test("refuses a body that is not a JSON object", () => {
    expect(refusal(null)).toBe("common.shared.requestBodyMustBeAJson");
    expect(refusal("hello")).toBe("common.shared.requestBodyMustBeAJson");
  });

  test("requires a readable scheduledAt that is not in the past", () => {
    expect(refusal(validBody({ scheduledAt: undefined }))).toBe(
      "errors.orders.scheduledatIsRequired",
    );
    expect(refusal(validBody({ scheduledAt: "next tuesday-ish" }))).toBe(
      "errors.orders.scheduledatMustBeAValidDate",
    );
    expect(
      refusal(
        validBody({
          scheduledAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }),
      ),
    ).toBe("errors.orders.scheduledatCannotBeInThePast");
  });

  test("absorbs a couple of minutes of clock skew on scheduledAt", () => {
    const result = parseCreateOrderBody(
      validBody({
        scheduledAt: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
      fakeT,
    );
    expect("error" in result).toBe(false);
  });

  test("refuses unknown enum values", () => {
    expect(refusal(validBody({ serviceLevel: "LUDICROUS" }))).toBe(
      "errors.orders.serviceLevelMustBeOneOf",
    );
    expect(refusal(validBody({ bodyType: "SUBMARINE" }))).toBe(
      "errors.orders.bodyTypeMustBeOneOf",
    );
    expect(refusal(validBody({ paymentMethodType: "BARTER" }))).toBe(
      "errors.orders.paymentMethodTypeMustBeOneOf",
    );
  });

  test("keeps the card and the method it pays with in agreement", () => {
    expect(refusal(validBody({ paymentMethodType: "CARD" }))).toBe(
      "common.shared.chooseASavedCardToPay",
    );
    expect(
      refusal(validBody({ paymentMethodType: "CASH", savedCardId: "card_1" })),
    ).toBe("common.shared.sendSavedcardidOnlyWhenPaymentmethodtypeIs");
  });

  test("refuses a partially declared cargo envelope", () => {
    expect(refusal(validBody({ cargoWeightKg: 300 }))).toBe(
      "errors.orders.cargoEnvelopeIncomplete",
    );
  });

  test("reports a bad measurement before the missing siblings", () => {
    expect(refusal(validBody({ cargoWeightKg: -1 }))).toBe(
      "errors.orders.fieldMeasurementOutOfRange",
    );
  });

  test("accepts a complete envelope", () => {
    const result = parseCreateOrderBody(
      validBody({
        cargoWeightKg: 300,
        cargoLengthM: 2,
        cargoWidthM: 1.2,
        cargoHeightM: 1,
      }),
      fakeT,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.data.cargoWeightKg).toBe(300);
  });

  test("de-duplicates handling tags rather than refusing them", () => {
    const result = parseCreateOrderBody(
      validBody({ handlingTags: ["FRAGILE", "FRAGILE"] }),
      fakeT,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.data.handlingTags).toEqual(["FRAGILE"]);

    expect(refusal(validBody({ handlingTags: "FRAGILE" }))).toBe(
      "errors.orders.handlingtagsMustBeAnArrayWhen",
    );
    expect(refusal(validBody({ handlingTags: ["EXPLOSIVE-ish"] }))).toBe(
      "errors.orders.handlingTagsMustContainOnly",
    );
  });

  test("orders the pickup window and the deadline only when both ends exist", () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    expect(
      refusal(
        validBody({
          pickupWindowStart: end.toISOString(),
          pickupWindowEnd: start.toISOString(),
        }),
      ),
    ).toBe("errors.orders.pickupwindowendMustBeAfterPickupwindowstart");

    expect(
      refusal(
        validBody({
          pickupWindowEnd: end.toISOString(),
          deliveryDeadline: start.toISOString(),
        }),
      ),
    ).toBe("errors.orders.deliverydeadlineMustBeAfterPickupwindowend");

    // A deadline against no window is an ordinary booking.
    const lone = parseCreateOrderBody(
      validBody({ deliveryDeadline: start.toISOString() }),
      fakeT,
    );
    expect("error" in lone).toBe(false);
  });

  test("caps free text at 200 characters", () => {
    expect(
      refusal(validBody({ pickupContact: { details: "x".repeat(201) } })),
    ).toBe("errors.orders.fieldTooLong");
  });

  test("ignores a waybill key — the order body has no document fields", () => {
    // The client enters nothing for the order-details document; a stale
    // client sending the old `waybill` object is neither refused nor kept.
    const result = parseCreateOrderBody(
      validBody({ waybill: { buyerName: "Nikora LLC" } }),
      fakeT,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.data).not.toHaveProperty("waybill");
  });
});

test.describe("resolveGeorgianCity", () => {
  test("matches a whole address component, never a substring", () => {
    expect(resolveGeorgianCity("Tbilisi Highway 4, Rustavi, Georgia")).toBe(
      "RUSTAVI",
    );
    expect(resolveGeorgianCity("1 Rustaveli Avenue, Tbilisi, Georgia")).toBe(
      "TBILISI",
    );
  });

  test("resolves an address naming no listed city to null", () => {
    expect(resolveGeorgianCity("Sarpi border crossing")).toBeNull();
  });
});
