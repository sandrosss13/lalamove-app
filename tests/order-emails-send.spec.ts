/**
 * Client order emails — who is sent one, in which language, with which links,
 * and the data the renderer is handed.
 *
 * `@/lib/email/order-emails/build` is the whole of those decisions as pure
 * functions over a plain order object; `src/lib/email/order-emails/send.ts`
 * only loads the order and acts on them. Pinned here rather than through the
 * routes because those need a database, and `DATABASE_URL` on this project is
 * production (see `playwright.config.ts`).
 */

import { expect, test } from "@playwright/test";

import { fromContentLocale, toContentLocale } from "@/i18n/routing";
import {
  buildOrderEmailData,
  confirmedTotalGel,
  orderEmailIdempotencyKey,
  orderEmailLinks,
  orderEmailLocale,
  orderEmailMessage,
  orderEmailRecipient,
  overtimeGel,
  type OrderEmailSource,
} from "@/lib/email/order-emails/build";
import { PHONE_PLACEHOLDER_EMAIL_DOMAIN } from "@/lib/phone-placeholder-email";

const ORIGIN = "https://zomo.ge";
const TOKEN = "a".repeat(43);

function source(overrides: Partial<OrderEmailSource> = {}): OrderEmailSource {
  return {
    id: "order_1",
    reference: "GE-48210",
    locale: "EN",
    clientId: "user_1",
    client: {
      email: "nino@example.com",
      deactivatedAt: null,
      clientProfile: { firstName: "Nino" },
    },
    guestEmail: null,
    guestFirstName: null,
    pickupWindowStart: new Date("2026-11-05T08:00:00Z"),
    pickupWindowEnd: new Date("2026-11-05T10:00:00Z"),
    scheduledAt: new Date("2026-11-05T07:00:00Z"),
    pickupAddress: "Rustaveli Ave 1, Tbilisi",
    pickupFloor: 3,
    pickupPassengerElevator: true,
    pickupCargoElevator: false,
    dropoffAddress: "Chavchavadze Ave 10, Tbilisi",
    dropoffFloor: 0,
    dropoffPassengerElevator: false,
    dropoffCargoElevator: true,
    helperCount: 2,
    items: [
      { label: "Sofa", quantity: 1 },
      { label: "Box", quantity: 12 },
    ],
    paymentMethodType: "CARD",
    payment: { status: "PAID" },
    price: 100.1,
    serviceLevelAdjustment: 20.2,
    overtimeFee: 15.05,
    helperOvertimeFee: 4.95,
    completedAt: new Date("2026-11-05T12:00:00Z"),
    receivedBy: "Giorgi",
    vehicle: { make: "Ford", model: "Transit", plateNumber: "AA-123-BB" },
    ...overrides,
  };
}

const GUEST: Partial<OrderEmailSource> = {
  clientId: null,
  client: null,
  guestEmail: "guest@example.com",
  guestFirstName: "Levan",
};

test.describe("orderEmailRecipient", () => {
  test("a registered client gets it at their account address", () => {
    expect(orderEmailRecipient(source())).toEqual({
      ok: true,
      to: "nino@example.com",
      firstName: "Nino",
      isGuest: false,
    });
  });

  test("a phone account's placeholder address is never mailed", () => {
    const result = orderEmailRecipient(
      source({
        client: {
          email: `995555123456@${PHONE_PLACEHOLDER_EMAIL_DOMAIN}`,
          deactivatedAt: null,
          clientProfile: { firstName: "Nino" },
        },
      }),
    );
    expect(result).toEqual({ ok: false, reason: "PHONE_PLACEHOLDER_ADDRESS" });
  });

  test("an empty account address, or a missing client row, is skipped", () => {
    expect(
      orderEmailRecipient(
        source({
          client: {
            email: "  ",
            deactivatedAt: null,
            clientProfile: null,
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "NO_ADDRESS" });
    expect(orderEmailRecipient(source({ client: null }))).toEqual({
      ok: false,
      reason: "NO_ADDRESS",
    });
  });

  test("a deactivated account is skipped", () => {
    expect(
      orderEmailRecipient(
        source({
          client: {
            email: "nino@example.com",
            deactivatedAt: new Date(),
            clientProfile: null,
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "ACCOUNT_DEACTIVATED" });
  });

  test("a registered client's guestEmail is never used", () => {
    expect(
      orderEmailRecipient(
        source({
          client: { email: "", deactivatedAt: null, clientProfile: null },
          guestEmail: "other@example.com",
        }),
      ),
    ).toEqual({ ok: false, reason: "NO_ADDRESS" });
  });

  test("a guest gets it at the checkout address, with their first name", () => {
    expect(orderEmailRecipient(source(GUEST))).toEqual({
      ok: true,
      to: "guest@example.com",
      firstName: "Levan",
      isGuest: true,
    });
  });

  test("a guest with no address is skipped; a blank name is null", () => {
    expect(orderEmailRecipient(source({ ...GUEST, guestEmail: null }))).toEqual(
      { ok: false, reason: "NO_ADDRESS" },
    );
    expect(
      orderEmailRecipient(source({ ...GUEST, guestFirstName: " " })),
    ).toMatchObject({ ok: true, firstName: null });
  });

  test("a client with no profile name greets without one", () => {
    expect(
      orderEmailRecipient(
        source({
          client: {
            email: "nino@example.com",
            deactivatedAt: null,
            clientProfile: null,
          },
        }),
      ),
    ).toMatchObject({ ok: true, firstName: null });
  });
});

test.describe("orderEmailLocale", () => {
  test("the order's stored locale wins", () => {
    expect(orderEmailLocale("EN", "ka")).toBe("en");
    expect(orderEmailLocale("KA", "en")).toBe("ka");
  });

  test("then the request's, then Georgian", () => {
    expect(orderEmailLocale(null, "en")).toBe("en");
    expect(orderEmailLocale(null)).toBe("ka");
    expect(orderEmailLocale(null, null)).toBe("ka");
  });

  test("ContentLocale round-trips", () => {
    expect(fromContentLocale(toContentLocale("en"))).toBe("en");
    expect(fromContentLocale(toContentLocale("ka"))).toBe("ka");
    expect(fromContentLocale(null)).toBeNull();
  });
});

test.describe("orderEmailLinks", () => {
  const registered = {
    origin: ORIGIN,
    locale: "en" as const,
    orderId: "order_1",
    isGuest: false,
  };

  test("registered client: track and order links on every kind", () => {
    for (const kind of [
      "ORDER_CONFIRMED",
      "DRIVER_ASSIGNED",
      "ORDER_CANCELLED",
    ] as const) {
      expect(orderEmailLinks({ ...registered, kind })).toEqual({
        track: "https://zomo.ge/en/orders/order_1/track",
        order: "https://zomo.ge/en/orders/order_1",
        receipt: null,
        bookAgain: "https://zomo.ge/en",
      });
    }
  });

  test("registered client: receipt only when delivered", () => {
    expect(
      orderEmailLinks({ ...registered, kind: "ORDER_DELIVERED" }).receipt,
    ).toBe("https://zomo.ge/api/orders/order_1/waybill/pdf?lang=en");
  });

  test("a trailing slash on the origin is not doubled", () => {
    expect(
      orderEmailLinks({
        ...registered,
        origin: "http://localhost:3000/",
        locale: "ka",
        kind: "ORDER_CONFIRMED",
      }).bookAgain,
    ).toBe("http://localhost:3000/ka");
  });

  test("guest: token tracking link in the confirmation only", () => {
    const guest = { ...registered, isGuest: true, guestToken: TOKEN };

    expect(orderEmailLinks({ ...guest, kind: "ORDER_CONFIRMED" })).toEqual({
      track: `https://zomo.ge/en/track/${TOKEN}`,
      order: null,
      receipt: null,
      bookAgain: "https://zomo.ge/en",
    });

    for (const kind of [
      "DRIVER_ASSIGNED",
      "ORDER_DELIVERED",
      "ORDER_CANCELLED",
    ] as const) {
      expect(orderEmailLinks({ ...guest, kind })).toEqual({
        track: null,
        order: null,
        receipt: null,
        bookAgain: "https://zomo.ge/en",
      });
    }
  });

  test("guest confirmation without a token has no tracking link", () => {
    expect(
      orderEmailLinks({
        ...registered,
        isGuest: true,
        guestToken: null,
        kind: "ORDER_CONFIRMED",
      }).track,
    ).toBeNull();
  });

  test("a registered client never gets a token link", () => {
    expect(
      orderEmailLinks({
        ...registered,
        guestToken: TOKEN,
        kind: "ORDER_CONFIRMED",
      }).track,
    ).toBe("https://zomo.ge/en/orders/order_1/track");
  });
});

test.describe("totals", () => {
  test("confirmed = price + service-level adjustment, to the cent", () => {
    expect(confirmedTotalGel(source())).toBe(120.3);
  });

  test("overtime = transport + helper overtime", () => {
    expect(overtimeGel(source())).toBe(20);
    expect(overtimeGel(source({ overtimeFee: 0, helperOvertimeFee: 0 }))).toBe(
      0,
    );
  });
});

test.describe("buildOrderEmailData", () => {
  const common = {
    recipient: { firstName: "Nino", isGuest: false },
    locale: "en" as const,
    links: {
      track: "t",
      order: "o",
      receipt: null,
      bookAgain: "b",
    },
    supportPhone: "+995 32 200 00 00",
    replyTo: "zomo support <support@zomo.ge>",
    vehicleLabel: "Cargo van",
  };

  test("ORDER_CONFIRMED carries the booking and the checkout total", () => {
    const data = buildOrderEmailData({
      ...common,
      kind: "ORDER_CONFIRMED",
      source: source(),
    });

    expect(data).toEqual({
      kind: "ORDER_CONFIRMED",
      locale: "en",
      reference: "GE-48210",
      firstName: "Nino",
      isGuest: false,
      pickupWindowStart: new Date("2026-11-05T08:00:00Z"),
      pickupWindowEnd: new Date("2026-11-05T10:00:00Z"),
      pickup: {
        address: "Rustaveli Ave 1, Tbilisi",
        floor: 3,
        passengerElevator: true,
        cargoElevator: false,
      },
      dropoff: {
        address: "Chavchavadze Ave 10, Tbilisi",
        floor: 0,
        passengerElevator: false,
        cargoElevator: true,
      },
      links: common.links,
      supportPhone: "+995 32 200 00 00",
      canReply: true,
      vehicleLabel: "Cargo van",
      helperCount: 2,
      items: [
        { label: "Sofa", quantity: 1 },
        { label: "Box", quantity: 12 },
      ],
      paymentMethod: "CARD",
      paid: true,
      totalGel: 120.3,
    });
  });

  test("Pay later (CASH) is confirmed but not paid", () => {
    const data = buildOrderEmailData({
      ...common,
      kind: "ORDER_CONFIRMED",
      source: source({
        paymentMethodType: "CASH",
        payment: { status: "PENDING" },
      }),
    });

    expect(data).toMatchObject({ paymentMethod: "CASH", paid: false });
  });

  test("an exact-time booking falls back to scheduledAt", () => {
    const data = buildOrderEmailData({
      ...common,
      kind: "ORDER_CONFIRMED",
      source: source({ pickupWindowStart: null, pickupWindowEnd: null }),
    });

    expect(data).toMatchObject({
      pickupWindowStart: new Date("2026-11-05T07:00:00Z"),
      pickupWindowEnd: null,
    });
  });

  test("DRIVER_ASSIGNED: vehicle, plate and company — no driver", () => {
    const data = buildOrderEmailData({
      ...common,
      kind: "DRIVER_ASSIGNED",
      source: source(),
      companyName: "Fast Cargo LLC",
    });

    expect(data).toMatchObject({
      kind: "DRIVER_ASSIGNED",
      vehicleLabel: "Cargo van",
      vehicle: { make: "Ford", model: "Transit", plate: "AA-123-BB" },
      companyName: "Fast Cargo LLC",
    });
    expect(
      Object.keys(data ?? {}).filter((key) => /driver/i.test(key)),
    ).toEqual([]);
  });

  test("DRIVER_ASSIGNED with no vehicle or company", () => {
    const data = buildOrderEmailData({
      ...common,
      kind: "DRIVER_ASSIGNED",
      source: source({ vehicle: null }),
    });

    expect(data).toMatchObject({
      vehicle: { make: null, model: null, plate: null },
      companyName: null,
    });
  });

  test("ORDER_DELIVERED: final total includes overtime", () => {
    const data = buildOrderEmailData({
      ...common,
      kind: "ORDER_DELIVERED",
      source: source(),
    });

    expect(data).toMatchObject({
      kind: "ORDER_DELIVERED",
      completedAt: new Date("2026-11-05T12:00:00Z"),
      receivedBy: "Giorgi",
      totalGel: 140.3,
      overtimeGel: 20,
    });
  });

  test("ORDER_DELIVERED without completedAt is not built", () => {
    expect(
      buildOrderEmailData({
        ...common,
        kind: "ORDER_DELIVERED",
        source: source({ completedAt: null }),
      }),
    ).toBeNull();
  });

  test("ORDER_CANCELLED: who cancelled, and whether it was paid", () => {
    expect(
      buildOrderEmailData({
        ...common,
        kind: "ORDER_CANCELLED",
        source: source({ payment: null, paymentMethodType: null }),
        cancelledBy: "CLIENT",
      }),
    ).toMatchObject({
      kind: "ORDER_CANCELLED",
      cancelledBy: "CLIENT",
      wasPaid: false,
    });

    expect(
      buildOrderEmailData({
        ...common,
        kind: "ORDER_CANCELLED",
        source: source(),
      }),
    ).toMatchObject({ cancelledBy: "CARRIER", wasPaid: true });
  });

  test("a guest's data says so", () => {
    expect(
      buildOrderEmailData({
        ...common,
        recipient: { firstName: "Levan", isGuest: true },
        kind: "ORDER_CANCELLED",
        source: source(GUEST),
      }),
    ).toMatchObject({ isGuest: true, firstName: "Levan" });
  });

  test("canReply follows the configured reply address", () => {
    for (const [replyTo, canReply] of [
      ["support@zomo.ge", true],
      [null, false],
      ["  ", false],
    ] as const) {
      expect(
        buildOrderEmailData({
          ...common,
          replyTo,
          kind: "ORDER_CANCELLED",
          source: source(),
        }),
        String(replyTo),
      ).toMatchObject({ canReply });
    }
  });
});

test.describe("reply address", () => {
  const RENDERED = { subject: "s", html: "<p>h</p>", text: "t" };

  test("the message carries replyTo only when configured", () => {
    const message = orderEmailMessage({
      to: "nino@example.com",
      rendered: RENDERED,
      kind: "ORDER_DELIVERED",
      orderId: "order_1",
      replyTo: "zomo support <support@zomo.ge>",
    });
    expect(message).toEqual({
      to: "nino@example.com",
      ...RENDERED,
      idempotencyKey: "order-email/ORDER_DELIVERED/order_1",
      replyTo: "zomo support <support@zomo.ge>",
    });

    const none = orderEmailMessage({
      to: "nino@example.com",
      rendered: RENDERED,
      kind: "ORDER_DELIVERED",
      orderId: "order_1",
      replyTo: null,
    });
    expect("replyTo" in none).toBe(false);
  });
});

test("idempotency key: one per kind per order", () => {
  expect(orderEmailIdempotencyKey("ORDER_CONFIRMED", "order_1")).toBe(
    "order-email/ORDER_CONFIRMED/order_1",
  );
});
