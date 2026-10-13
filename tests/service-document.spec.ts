/**
 * The order-details document's pure half (`src/lib/orders/service-document.ts`):
 * how the amount the client paid is split into net / VAT / grand total, and the
 * small name helpers the PDF and the order page share. No browser, no server,
 * no database.
 */

import { expect, test } from "@playwright/test";

import {
  SERVICE_VAT_RATE,
  computeServiceAmounts,
  driverFullName,
  isGeorgianPersonalNumber,
  roundCurrency,
  vehicleMakeModel,
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
