/**
 * The order-details document's pure half (`src/lib/orders/service-document.ts`):
 * how the amount the client paid is split into transport / services / discount
 * and the VAT it contains, the document number's format, and the small name
 * helpers the PDF and the order page share. No browser, no server, no
 * database.
 */

import { expect, test } from "@playwright/test";

import {
  SERVICE_VAT_RATE,
  computeDocumentFinance,
  computeServiceAmounts,
  driverFullName,
  formatDocumentNumber,
  isGeorgianPersonalNumber,
  roundCurrency,
  vehicleMakeModel,
  type DocumentFinance,
  type DocumentFinanceInput,
} from "@/lib/orders/service-document";

test.describe("computeServiceAmounts", () => {
  test("backs 18% VAT out of a VAT-inclusive amount", () => {
    expect(SERVICE_VAT_RATE).toBe(0.18);
    expect(computeServiceAmounts(118)).toEqual({
      gross: 118,
      net: 100,
      vat: 18,
      vatRate: 0.18,
    });
  });

  test("net + VAT always equals the gross to the tetri", () => {
    for (const gross of [1, 0.01, 99.99, 245.5, 1000, 12345.67, 3.33]) {
      const { net, vat, gross: total } = computeServiceAmounts(gross);
      expect(roundCurrency(net + vat)).toBe(total);
      expect(net).toBe(roundCurrency(total / 1.18));
    }
  });

  test("rounds the gross itself and handles zero", () => {
    expect(computeServiceAmounts(100.004).gross).toBe(100);
    expect(computeServiceAmounts(0)).toEqual({
      gross: 0,
      net: 0,
      vat: 0,
      vatRate: 0.18,
    });
  });

  test("1000 GEL → 847.46 net + 152.54 VAT", () => {
    const amounts = computeServiceAmounts(1000);
    expect(amounts.net).toBe(847.46);
    expect(amounts.vat).toBe(152.54);
  });
});

test.describe("helpers", () => {
  test("roundCurrency rounds half away from zero, without float dust", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(-1.005)).toBe(-1.01);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  test("vehicle make + model and driver name join what exists", () => {
    expect(vehicleMakeModel({ make: "Hino", model: "916" })).toBe("Hino 916");
    expect(vehicleMakeModel({ make: " Hino ", model: null })).toBe("Hino");
    expect(vehicleMakeModel({ make: null, model: "  " })).toBeNull();
    expect(driverFullName({ firstName: "Nino", lastName: "Beridze" })).toBe(
      "Nino Beridze",
    );
    expect(driverFullName({ firstName: null, lastName: null })).toBeNull();
  });

  test("a Georgian personal number is exactly 11 digits", () => {
    expect(isGeorgianPersonalNumber("01001012345")).toBe(true);
    expect(isGeorgianPersonalNumber("0100101234")).toBe(false);
    expect(isGeorgianPersonalNumber("0100101234a")).toBe(false);
  });
});

/** A v1 REGULAR order: 100 GEL transport, 30 + 20 GEL helpers, no overtime. */
const V1_ORDER: DocumentFinanceInput = {
  price: 150,
  serviceLevelAdjustment: 0,
  overtimeFee: 0,
  helperOvertimeFee: 0,
  helperFee: 50,
  pickupHelperFee: 30,
  dropoffHelperFee: 20,
  transportFare: 100,
  tariffVersion: 1,
  paymentStatus: "PAID",
};

/** transport + services + discount = total, to the tetri. */
function expectReconciles(finance: DocumentFinance): void {
  expect(
    roundCurrency(finance.transport + finance.services + finance.discount),
  ).toBe(finance.total);
  expect(
    roundCurrency(
      finance.servicesBreakdown.helpers + finance.servicesBreakdown.overtime,
    ),
  ).toBe(finance.services);
  expect(finance.discount).toBeLessThanOrEqual(0);
}

test.describe("computeDocumentFinance", () => {
  test("REGULAR v1: helpers are the two per-stop fees, counted once", () => {
    const finance = computeDocumentFinance(V1_ORDER);
    expect(finance).toEqual({
      transport: 100,
      services: 50,
      servicesBreakdown: { helpers: 50, overtime: 0 },
      discount: 0,
      discountPercent: null,
      total: 150,
      vat: computeServiceAmounts(150).vat,
      vatRate: SERVICE_VAT_RATE,
      paymentStatus: "PAID",
    });
    expectReconciles(finance);
  });

  test("POOLING: the negative adjustment is the discount, as % of transport", () => {
    const finance = computeDocumentFinance({
      ...V1_ORDER,
      serviceLevelAdjustment: -10,
    });
    expect(finance.total).toBe(140);
    expect(finance.discount).toBe(-10);
    expect(finance.discountPercent).toBe(10);
    expect(finance.transport).toBe(100);
    expect(finance.services).toBe(50);
    expect(finance.vat).toBe(computeServiceAmounts(140).vat);
    expectReconciles(finance);
  });

  test("PRIORITY: the surcharge stays inside transport, no discount line", () => {
    const finance = computeDocumentFinance({
      ...V1_ORDER,
      serviceLevelAdjustment: 25,
    });
    expect(finance.total).toBe(175);
    expect(finance.transport).toBe(125);
    expect(finance.discount).toBe(0);
    expect(Object.is(finance.discount, -0)).toBe(false);
    expect(finance.discountPercent).toBeNull();
    expectReconciles(finance);
  });

  test("overtime (vehicle waiting + helpers) is a service on top of the quote", () => {
    const finance = computeDocumentFinance({
      ...V1_ORDER,
      overtimeFee: 12.5,
      helperOvertimeFee: 20,
    });
    expect(finance.total).toBe(182.5);
    expect(finance.servicesBreakdown).toEqual({ helpers: 50, overtime: 32.5 });
    expect(finance.services).toBe(82.5);
    expect(finance.transport).toBe(100);
    expectReconciles(finance);
  });

  test("pre-v1: the single helperFee, tier % of the whole price", () => {
    const finance = computeDocumentFinance({
      price: 80,
      serviceLevelAdjustment: -8,
      overtimeFee: 0,
      helperOvertimeFee: 0,
      helperFee: 20,
      pickupHelperFee: 0,
      dropoffHelperFee: 0,
      transportFare: null,
      tariffVersion: null,
      paymentStatus: null,
    });
    expect(finance.servicesBreakdown.helpers).toBe(20);
    expect(finance.discountPercent).toBe(10);
    expect(finance.transport).toBe(60);
    expect(finance.total).toBe(72);
    expect(finance.paymentStatus).toBe("PENDING");
    expectReconciles(finance);
  });

  test("reconciles to the tetri on awkward floating-point amounts", () => {
    for (const [transport, pickup, dropoff, adj, overtime] of [
      [33.33, 10.01, 0.07, -3.33, 0.1],
      [99.99, 0, 0, 24.9975, 0],
      [13, 1.1, 2.2, -1.3, 7.77],
    ] as const) {
      const finance = computeDocumentFinance({
        ...V1_ORDER,
        price: transport + pickup + dropoff,
        transportFare: transport,
        pickupHelperFee: pickup,
        dropoffHelperFee: dropoff,
        helperFee: pickup + dropoff,
        serviceLevelAdjustment: adj,
        overtimeFee: overtime,
      });
      expectReconciles(finance);
    }
  });
});

test.describe("formatDocumentNumber", () => {
  test("INV-{year}-{7-digit zero-padded sequence}", () => {
    expect(formatDocumentNumber(2026, 12489)).toBe("INV-2026-0012489");
    expect(formatDocumentNumber(2027, 1)).toBe("INV-2027-0000001");
  });

  test("a sequence past 7 digits is printed whole, never truncated", () => {
    expect(formatDocumentNumber(2030, 12345678)).toBe("INV-2030-12345678");
  });
});
