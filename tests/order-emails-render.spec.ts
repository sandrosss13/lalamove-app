/**
 * The client order emails' renderer (`@/lib/email/order-emails/render`): what
 * each of the four emails says in both languages, that user input is escaped
 * in the HTML part, and that a null in the data drops its line instead of
 * leaking "null", "undefined" or an unfilled `{placeholder}`.
 *
 * Pure: the catalogs are read off disk (as in `i18n-catalogs.spec.ts` — the
 * barrels' bare JSON imports do not load under Playwright's ESM loader) and
 * fed through the same `createTranslator` `send.ts` uses.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import { createTranslator } from "next-intl";

import type { AppLocale } from "@/i18n/routing";
import type { Translator } from "@/i18n/translator";
import { renderOrderEmail } from "@/lib/email/order-emails/render";
import type {
  DriverAssignedData,
  OrderCancelledData,
  OrderConfirmedData,
  OrderDeliveredData,
  OrderEmailBase,
  OrderEmailData,
  RenderedOrderEmail,
} from "@/lib/email/order-emails/types";

const LOCALES: AppLocale[] = ["en", "ka"];
const LOGO_URL = "https://zomo.ge/zomo-logo.png";

function translator(locale: AppLocale): Translator {
  const catalog = JSON.parse(
    readFileSync(
      join(process.cwd(), "src", "messages", locale, "orderEmails.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const errors: string[] = [];

  const t = createTranslator({
    locale,
    messages: { orderEmails: catalog },
    namespace: "orderEmails",
    onError: (error) => {
      errors.push(error.message);
    },
  }) as unknown as Translator;

  // A missing key or a bad ICU message is a test failure, not a key path
  // rendered into an email.
  return (key, values) => {
    const result = t(key, values);
    if (errors.length > 0) {
      throw new Error(`orderEmails.${key} (${locale}): ${errors.join("; ")}`);
    }
    return result;
  };
}

function base(locale: AppLocale): OrderEmailBase {
  return {
    locale,
    reference: "GE-48210",
    firstName: "Nino",
    isGuest: false,
    // 10:00–10:30 in Tbilisi (UTC+4) on Friday 6 November 2026.
    pickupWindowStart: new Date("2026-11-06T06:00:00Z"),
    pickupWindowEnd: new Date("2026-11-06T06:30:00Z"),
    pickup: {
      address: "12 Chavchavadze Ave, Tbilisi",
      floor: 3,
      passengerElevator: true,
      cargoElevator: false,
    },
    dropoff: {
      address: "5 Kazbegi Ave, Tbilisi",
      floor: 0,
      passengerElevator: false,
      cargoElevator: false,
    },
    links: {
      track: "https://zomo.ge/en/orders/ord_1/track",
      order: "https://zomo.ge/en/orders/ord_1",
      receipt: "https://zomo.ge/api/orders/ord_1/document",
      bookAgain: "https://zomo.ge/en",
    },
    supportPhone: "+995 32 200 00 00",
    canReply: true,
  };
}

function confirmed(locale: AppLocale): OrderConfirmedData {
  return {
    ...base(locale),
    kind: "ORDER_CONFIRMED",
    vehicleLabel: "Van · up to 1.5 t",
    helperCount: 2,
    items: [
      { label: "Sofa", quantity: 1 },
      { label: "Wardrobe", quantity: 1 },
      { label: "Boxes", quantity: 8 },
      { label: "Lamp", quantity: 1 },
      { label: "Desk", quantity: 1 },
      { label: "Chair", quantity: 4 },
    ],
    paymentMethod: "CARD",
    paid: true,
    totalGel: 185,
  };
}

function driverAssigned(locale: AppLocale): DriverAssignedData {
  return {
    ...base(locale),
    kind: "DRIVER_ASSIGNED",
    vehicleLabel: "Van · up to 1.5 t",
    vehicle: { make: "Ford", model: "Transit", plate: "AB-123-CD" },
    companyName: "Kartli Logistics",
  };
}

function delivered(locale: AppLocale): OrderDeliveredData {
  return {
    ...base(locale),
    kind: "ORDER_DELIVERED",
    completedAt: new Date("2026-11-06T10:32:00Z"),
    receivedBy: "Giorgi",
    totalGel: 1205.5,
    overtimeGel: 20.5,
  };
}

function cancelled(
  locale: AppLocale,
  cancelledBy: OrderCancelledData["cancelledBy"] = "CLIENT",
): OrderCancelledData {
  return {
    ...base(locale),
    kind: "ORDER_CANCELLED",
    cancelledBy,
    wasPaid: true,
  };
}

function render(data: OrderEmailData): RenderedOrderEmail {
  return renderOrderEmail(data, translator(data.locale), { logoUrl: LOGO_URL });
}

/** Nothing unfilled, nothing that reads as a JS value, in any part. */
function expectClean(email: RenderedOrderEmail) {
  for (const [part, value] of Object.entries(email)) {
    expect(value, part).not.toMatch(/undefined|null|NaN|\[object/);
    // ICU placeholders that never got a value. `{` legitimately appears in
    // nothing we render — inline styles use `:` and `;` only.
    expect(value, part).not.toMatch(/[{}]/);
    expect(value, part).not.toContain("orderEmails.");
  }
}

const ALL = [
  ["ORDER_CONFIRMED", confirmed],
  ["DRIVER_ASSIGNED", driverAssigned],
  ["ORDER_DELIVERED", delivered],
  ["ORDER_CANCELLED", (l: AppLocale) => cancelled(l)],
  ["ORDER_CANCELLED by carrier", (l: AppLocale) => cancelled(l, "CARRIER")],
] as const;

test.describe("every email renders in both languages", () => {
  for (const [name, make] of ALL) {
    for (const locale of LOCALES) {
      test(`${name} (${locale})`, () => {
        const email = render(make(locale));

        expect(email.subject).toContain("GE-48210");
        expect(email.html).toContain(`<html lang="${locale}">`);
        expect(email.html).toContain(`src="${LOGO_URL}"`);
        expect(email.html).toContain('alt="zomo"');
        expect(email.html).toContain("max-width:600px");
        expect(email.text).toContain("GE-48210");
        expect(email.text.length).toBeGreaterThan(100);
        expectClean(email);

        if (locale === "ka") {
          // Georgian script, not the English fallback.
          expect(email.subject).toMatch(/[ა-ჿ]/);
          expect(email.text).toMatch(/[ა-ჿ]/);
        }
      });
    }
  }
});

test.describe("English copy", () => {
  test("ORDER_CONFIRMED", () => {
    const email = render(confirmed("en"));

    expect(email.subject).toBe("Order GE-48210 is booked");
    expect(email.text).toContain("Booking confirmed");
    expect(email.text).toContain("Your order is booked, Nino");
    expect(email.text).toContain("Fri, 6 November · 10:00–10:30");
    expect(email.text).toContain("3rd floor · Passenger elevator");
    expect(email.text).toContain("Ground floor");
    expect(email.text).toContain("2 helpers");
    expect(email.text).toContain(
      "Items:\n- Sofa — 1 pcs\n- Wardrobe — 1 pcs\n- Boxes — 8 pcs\n- Lamp — 1 pcs\n- Desk — 1 pcs\n- Chair — 4 pcs",
    );
    expect(email.text).not.toContain("+2 more");
    expect(email.text).toContain("Card · paid");
    expect(email.text).toContain("₾185.00");
    expect(email.text).toContain(
      "Track your order: https://zomo.ge/en/orders/ord_1/track",
    );
    expect(email.text).toContain(
      "View your order: https://zomo.ge/en/orders/ord_1",
    );
    expect(email.text).toContain("The driver will call you on arrival.");
    expect(email.text).toContain(
      "Questions? Reply to this email or call +995 32 200 00 00.",
    );
    expect(email.text).toContain(
      "You're getting this email because you placed an order on zomo.",
    );
    expect(email.html).toContain("#fdeee7");
  });

  test("ORDER_CONFIRMED payment methods and no helpers", () => {
    const later = render({
      ...confirmed("en"),
      paymentMethod: "CASH",
      paid: false,
      helperCount: 0,
    });
    expect(later.text).toContain("Pay later");
    expect(later.text).not.toContain("Helpers");

    const bank = render({
      ...confirmed("en"),
      paymentMethod: "BANK_TRANSFER",
      paid: false,
    });
    expect(bank.text).toContain("Payment: Bank transfer");

    const none = render({ ...confirmed("en"), paymentMethod: null, items: [] });
    expect(none.text).not.toContain("Payment");
    expect(none.text).not.toContain("Items");
    expect(none.html).not.toContain(">Qty<");
  });

  test("ORDER_CONFIRMED lists every item as its own row with a quantity", () => {
    const email = render(confirmed("en"));

    for (const [label, qty] of [
      ["Sofa", "1 pcs"],
      ["Boxes", "8 pcs"],
      ["Chair", "4 pcs"],
    ]) {
      expect(email.html).toMatch(
        new RegExp(`>${label}</td>\\s*<td[^>]*>${qty}</td>`),
      );
    }
    expect(email.html).toContain(">Qty</td>");
    // Items sit between the route and the details rows.
    expect(email.text.indexOf("Items:")).toBeGreaterThan(
      email.text.indexOf("To:"),
    );
    expect(email.text.indexOf("Items:")).toBeLessThan(
      email.text.indexOf("Vehicle:"),
    );
  });

  test("ORDER_CONFIRMED caps the item list at 20 with a +N more row", () => {
    const items = Array.from({ length: 23 }, (_, i) => ({
      label: `Thing ${i + 1}`,
      quantity: 1,
    }));
    const email = render({ ...confirmed("en"), items });

    expect(email.text).toContain("- Thing 20 — 1 pcs");
    expect(email.text).not.toContain("Thing 21");
    expect(email.text).toContain("- +3 more");
    expect(email.html).toContain(">+3 more</td>");
  });

  test("DRIVER_ASSIGNED", () => {
    const email = render(driverAssigned("en"));

    expect(email.subject).toBe("A driver has been assigned to order GE-48210");
    expect(email.text).toContain("A driver is on your order");
    expect(email.text).toContain("Kartli Logistics has assigned a driver");
    expect(email.text).toContain("Ford Transit");
    expect(email.text).toContain("AB-123-CD");
    expect(email.text).toContain("pay only through zomo");
    expect(email.html).toContain("letter-spacing:0.12em");
    expect(email.html).toContain("#e8f0fa");
  });

  test("ORDER_DELIVERED", () => {
    const email = render(delivered("en"));

    expect(email.subject).toBe("Order GE-48210 has been delivered");
    expect(email.text).toContain(
      "Delivered to 5 Kazbegi Ave, Tbilisi on Fri, 6 November at 14:32. Signed for by Giorgi.",
    );
    expect(email.text).toContain(
      "Photos and signature are on the tracking page.",
    );
    expect(email.text).toContain("Overtime: ₾20.50");
    expect(email.text).toContain("Total: ₾1,205.50");
    expect(email.text).toContain("Download receipt (PDF)");
    expect(email.text).toContain("Book another delivery: https://zomo.ge/en");
    expect(email.text).not.toMatch(/rate|star/i);
  });

  test("ORDER_DELIVERED without overtime or receipt", () => {
    const email = render({
      ...delivered("en"),
      overtimeGel: 0,
      receivedBy: null,
      links: { ...base("en").links, receipt: null },
    });

    expect(email.text).not.toContain("Overtime");
    expect(email.text).not.toContain("Signed for");
    expect(email.text).not.toContain("receipt");
  });

  test("ORDER_CANCELLED by the client and by the carrier", () => {
    const client = render(cancelled("en"));
    expect(client.subject).toBe("Order GE-48210 has been cancelled");
    expect(client.text).toContain(
      "As you asked, we've cancelled your order for Fri, 6 November.",
    );
    expect(client.text).toContain("sort out your refund");
    expect(client.text).toContain("Didn't cancel this order?");
    expect(client.text).toContain("Book again: https://zomo.ge/en");

    const carrier = render({ ...cancelled("en", "CARRIER"), wasPaid: false });
    expect(carrier.text).toContain("the carrier had to cancel your order");
    expect(carrier.text).not.toContain("Didn't cancel");
    expect(carrier.text).not.toContain("refund");
  });

  test("ORDER_CANCELLED with no pickup date", () => {
    const email = render({
      ...cancelled("en"),
      pickupWindowStart: null,
      pickupWindowEnd: null,
    });
    expect(email.text).toContain("As you asked, we've cancelled your order.");
    expectClean(email);
  });
});

test.describe("Georgian copy", () => {
  test("dates, floors and money", () => {
    const email = render(confirmed("ka"));

    expect(email.subject).toBe("შეკვეთა GE-48210 დაჯავშნილია");
    expect(email.text).toContain("6 ნოემბერი · 10:00–10:30");
    expect(email.text).toContain("მე-3 სართული");
    expect(email.text).toContain("მიწის დონე");
    expect(email.text).toContain("₾185.00");
  });
});

test.describe("escaping", () => {
  const hostile = '<script>alert("x")</script>&\'';

  test("user input is escaped in the HTML and left readable in the text", () => {
    for (const data of [
      {
        ...confirmed("en"),
        firstName: hostile,
        pickup: { ...base("en").pickup, address: hostile },
        items: [{ label: hostile, quantity: 2 }],
      },
      {
        ...driverAssigned("en"),
        companyName: hostile,
        vehicle: { make: hostile, model: null, plate: hostile },
      },
      {
        ...delivered("en"),
        receivedBy: hostile,
        dropoff: { ...base("en").dropoff, address: hostile },
      },
    ] satisfies OrderEmailData[]) {
      const email = render(data);

      expect(email.html).not.toContain("<script>");
      expect(email.html).not.toContain('"><b>');
      expect(email.html).not.toContain(hostile);
      expect(email.html).toContain("&lt;script&gt;");
      expect(email.text).toContain("<script>");
    }
  });

  test("a link cannot break out of its attribute", () => {
    const email = render({
      ...confirmed("en"),
      links: { ...base("en").links, track: 'https://x.test/"><b>' },
    });
    expect(email.html).not.toContain('"><b>');
    expect(email.html).toContain('href="https://x.test/&quot;&gt;&lt;b&gt;"');
  });

  test("a value that looks like an ICU message is not interpreted", () => {
    const email = render({ ...confirmed("en"), firstName: "{name}" });
    expect(email.text).toContain("Your order is booked, {name}");
  });
});

test.describe("null data drops its line", () => {
  test("no first name", () => {
    const email = render({ ...confirmed("en"), firstName: null });
    expect(email.text).toContain("Your order is booked\n");
    expect(email.text).not.toContain("booked,");
    expectClean(email);
  });

  test("no tracking or order link", () => {
    const email = render({
      ...confirmed("en"),
      links: { ...base("en").links, track: null, order: null },
    });
    expect(email.text).not.toContain("Track your order");
    expect(email.text).not.toContain("View your order");
    expectClean(email);
  });

  test("no support phone", () => {
    for (const data of [confirmed("en"), delivered("en"), cancelled("en")]) {
      const email = render({ ...data, supportPhone: null });
      expect(email.text).toContain("Questions? Reply to this email.");
      expect(email.text).not.toContain(" or call");
      expect(email.text).not.toContain("+995");
      expectClean(email);
    }
  });
});

/**
 * `canReply` (EMAIL_REPLY_TO configured) × support phone. `EMAIL_FROM` is a
 * no-reply address, so without a reply address no email may say "reply".
 */
test.describe("contact lines: reply address × support phone", () => {
  const PHONE = "+995 32 200 00 00";
  const REPLY = /reply|უპასუხეთ/i;

  test("reply and phone", () => {
    const delivery = render(delivered("en"));
    expect(delivery.text).toContain(
      `Questions? Reply to this email or call ${PHONE}.`,
    );
    expect(delivery.text).toContain(
      `Something damaged or missing? Reply to this email or call ${PHONE}.`,
    );
    const cancel = render(cancelled("en"));
    expect(cancel.text).toContain(
      `Didn't cancel this order? Contact support by replying to this email or calling ${PHONE}.`,
    );
  });

  test("reply, no phone", () => {
    const delivery = render({ ...delivered("en"), supportPhone: null });
    expect(delivery.text).toContain("Questions? Reply to this email.");
    expect(delivery.text).toContain(
      "Something damaged or missing? Reply to this email.",
    );
    const cancel = render({ ...cancelled("en"), supportPhone: null });
    expect(cancel.text).toContain(
      "Didn't cancel this order? Contact support by replying to this email.",
    );
  });

  test("phone, no reply address: phone only, never 'reply'", () => {
    for (const locale of LOCALES) {
      for (const [name, make] of ALL) {
        const email = render({ ...make(locale), canReply: false });
        expect(email.text, `${name} ${locale}`).not.toMatch(REPLY);
        expect(email.html, `${name} ${locale}`).not.toMatch(REPLY);
        expect(email.text).toContain(PHONE);
        expectClean(email);
      }
    }

    const delivery = render({ ...delivered("en"), canReply: false });
    expect(delivery.text).toContain(`Questions? Call us on ${PHONE}.`);
    expect(delivery.text).toContain(
      `Something damaged or missing? Call us on ${PHONE}.`,
    );
    const cancel = render({ ...cancelled("en"), canReply: false });
    expect(cancel.text).toContain(
      `Didn't cancel this order? Contact support by calling ${PHONE}.`,
    );
    const ka = render({ ...delivered("ka"), canReply: false });
    expect(ka.text).toContain(`გაქვთ კითხვები? დაგვირეკეთ: ${PHONE}.`);
  });

  test("neither: the lines are dropped, the footer keeps zomo.ge", () => {
    for (const locale of LOCALES) {
      for (const [name, make] of ALL) {
        const email = render({
          ...make(locale),
          canReply: false,
          supportPhone: null,
        });
        expect(email.text, `${name} ${locale}`).not.toMatch(REPLY);
        expect(email.html, `${name} ${locale}`).not.toMatch(REPLY);
        expect(email.text).not.toMatch(/Questions\?|გაქვთ კითხვები/);
        expect(email.text).not.toMatch(/damaged or missing|დაზიანდა/);
        expect(email.text).not.toMatch(/Didn't cancel|არ გაგიუქმებიათ/);
        expect(email.text).toContain("zomo.ge: https://zomo.ge");
        expectClean(email);
      }
    }
  });

  test("no pickup window, floors or vehicle details", () => {
    const stop = {
      address: "Somewhere",
      floor: null,
      passengerElevator: false,
      cargoElevator: false,
    };
    const email = render({
      ...driverAssigned("en"),
      pickupWindowStart: null,
      pickupWindowEnd: null,
      pickup: stop,
      dropoff: stop,
      vehicleLabel: null,
      vehicle: { make: null, model: null, plate: null },
      companyName: null,
    });
    expect(email.text).not.toContain("Pickup");
    expect(email.text).not.toContain("floor");
    expect(email.text).not.toContain("Licence plate");
    expect(email.text).toContain("A driver has been assigned to your order.");
    expectClean(email);
  });

  test("an exact pickup time shows one time", () => {
    const email = render({ ...confirmed("en"), pickupWindowEnd: null });
    expect(email.text).toContain("Pickup time: Fri, 6 November · 10:00");
    expect(email.text).not.toContain("–");
  });

  test("a guest's later emails point to the booking email's tracking link", () => {
    const guestLinks = {
      track: null,
      order: null,
      receipt: null,
      bookAgain: "https://zomo.ge/en",
    };

    const assigned = render({
      ...driverAssigned("en"),
      isGuest: true,
      links: guestLinks,
    });
    expect(assigned.text).toContain(
      "Use the tracking link from your booking confirmation email to follow your order.",
    );
    expect(assigned.text).not.toContain("Track your order");
    expectClean(assigned);

    const done = render({
      ...delivered("en"),
      isGuest: true,
      links: guestLinks,
    });
    expect(done.text).toContain(
      "use the link from your booking confirmation email",
    );
    expectClean(done);

    // A registered client without a link gets no guest hint.
    const registered = render({
      ...driverAssigned("en"),
      links: { ...guestLinks },
    });
    expect(registered.text).not.toContain("booking confirmation email");
  });
});

test("both catalogs hold the same keys", () => {
  const flatten = (value: unknown, prefix = ""): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([k, v]) =>
          flatten(v, prefix ? `${prefix}.${k}` : k),
        )
      : [prefix];
  const keys = (locale: AppLocale) =>
    flatten(
      JSON.parse(
        readFileSync(
          join(process.cwd(), "src", "messages", locale, "orderEmails.json"),
          "utf8",
        ),
      ),
    ).sort();

  expect(keys("ka")).toEqual(keys("en"));
});
