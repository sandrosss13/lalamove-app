/**
 * The saved-address body parser and duplicate key
 * (`src/lib/saved-addresses/parse-input.ts`).
 *
 * Pure, like `tests/order-input.spec.ts`: no browser, no server, no database.
 * The translator is a fake that echoes its key, and every key it is asked for
 * is checked against the English catalog so a typo'd key fails here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import type { RequestTranslator } from "@/i18n/request-locale";
import { STOP_CONTACT_MAX_LENGTHS } from "@/lib/orders/stop-contact-limits";
import { MAX_FLOOR } from "@/lib/pricing";
import { SAVED_ADDRESS_LABEL_MAX_LENGTH } from "@/lib/saved-addresses/contract";
import {
  normaliseAddressKey,
  parseSavedAddressBody,
  resolveLabel,
  SAVED_ADDRESS_MAX_LENGTH,
} from "@/lib/saved-addresses/parse-input";
import { toSavedAddressDto } from "@/lib/saved-addresses/serialize";

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

const t = ((key: string) => {
  if (!catalogHas(key)) throw new Error(`Missing catalog key: ${key}`);
  return key;
}) as unknown as RequestTranslator;

function errorOf(result: { data: unknown } | { error: string }): string {
  if (!("error" in result)) throw new Error("expected an error");
  return result.error;
}

function dataOf<T>(result: { data: T } | { error: string }): T {
  if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
  return result.data;
}

test.describe("parseSavedAddressBody (POST)", () => {
  test("fills every omitted field with its default", () => {
    expect(
      dataOf(parseSavedAddressBody({ address: " Rustaveli 12 " }, t)),
    ).toEqual({
      address: "Rustaveli 12",
      label: "",
      lat: null,
      lng: null,
      contactName: "",
      contactPhone: "",
      buildingName: "",
      entrance: "",
      comment: "",
      floor: 0,
      passengerElevator: false,
      cargoElevator: false,
    });
  });

  test("keeps a full, valid body", () => {
    const body = {
      label: " Home ",
      address: "Rustaveli 12, Tbilisi",
      lat: 41.7,
      lng: 44.8,
      contactName: " Nino ",
      contactPhone: " +995 555 12 34 56 ",
      buildingName: "Block B",
      entrance: "3",
      comment: "Code 1234",
      floor: 7,
      passengerElevator: true,
      cargoElevator: false,
    };
    expect(dataOf(parseSavedAddressBody(body, t))).toEqual({
      ...body,
      label: "Home",
      contactName: "Nino",
      contactPhone: "+995 555 12 34 56",
    });
  });

  test("requires a non-empty address", () => {
    for (const address of [undefined, "", "   ", 42]) {
      expect(errorOf(parseSavedAddressBody({ address }, t))).toBe(
        "errors.savedAddresses.addressIsRequired",
      );
    }
  });

  test("refuses an over-long address instead of cutting it", () => {
    expect(
      errorOf(
        parseSavedAddressBody(
          { address: "a".repeat(SAVED_ADDRESS_MAX_LENGTH + 1) },
          t,
        ),
      ),
    ).toBe("errors.savedAddresses.addressTooLong");
  });

  test("refuses a non-object body", () => {
    for (const body of [null, "x", [], 1]) {
      expect(errorOf(parseSavedAddressBody(body, t))).toBe(
        "errors.savedAddresses.bodyMustBeAnObject",
      );
    }
  });

  test("cuts over-long text to the stop-contact bounds", () => {
    const data = dataOf(
      parseSavedAddressBody(
        {
          address: "x",
          label: "L".repeat(100),
          contactName: "n".repeat(300),
          buildingName: "b".repeat(300),
          entrance: "e".repeat(300),
          comment: "c".repeat(900),
        },
        t,
      ),
    );
    expect(data.label).toHaveLength(SAVED_ADDRESS_LABEL_MAX_LENGTH);
    expect(data.contactName).toHaveLength(STOP_CONTACT_MAX_LENGTHS.name);
    expect(data.buildingName).toHaveLength(
      STOP_CONTACT_MAX_LENGTHS.buildingName,
    );
    expect(data.entrance).toHaveLength(STOP_CONTACT_MAX_LENGTHS.entrance);
    expect(data.comment).toHaveLength(STOP_CONTACT_MAX_LENGTHS.comment);
  });

  test("refuses a non-string text field", () => {
    expect(
      errorOf(parseSavedAddressBody({ address: "x", contactPhone: 555 }, t)),
    ).toBe("errors.savedAddresses.fieldMustBeString");
  });

  test("truncates and clamps the floor", () => {
    const floorOf = (floor: unknown) =>
      dataOf(parseSavedAddressBody({ address: "x", floor }, t)).floor;
    expect(floorOf(3.9)).toBe(3);
    expect(floorOf(-2)).toBe(0);
    expect(floorOf(MAX_FLOOR + 50)).toBe(MAX_FLOOR);
    expect(floorOf(null)).toBe(0);
    for (const floor of ["3", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(errorOf(parseSavedAddressBody({ address: "x", floor }, t))).toBe(
        "errors.savedAddresses.floorMustBeANumber",
      );
    }
  });

  test("refuses a non-boolean elevator flag", () => {
    expect(
      errorOf(parseSavedAddressBody({ address: "x", cargoElevator: "yes" }, t)),
    ).toBe("errors.savedAddresses.fieldMustBeTrueOrFalse");
  });

  test("validates coordinates and keeps them as a pair", () => {
    for (const coords of [
      { lat: 91, lng: 0 },
      { lat: 0, lng: -181 },
      { lat: "41", lng: 44 },
    ]) {
      expect(
        errorOf(parseSavedAddressBody({ address: "x", ...coords }, t)),
      ).toBe("errors.savedAddresses.coordinatesInvalid");
    }
    const half = dataOf(parseSavedAddressBody({ address: "x", lat: 41 }, t));
    expect([half.lat, half.lng]).toEqual([null, null]);
  });
});

test.describe("parseSavedAddressBody (PATCH)", () => {
  test("returns only the fields the body carries", () => {
    expect(
      dataOf(
        parseSavedAddressBody({ entrance: " 2 ", floor: 4 }, t, {
          partial: true,
        }),
      ),
    ).toEqual({ entrance: "2", floor: 4 });
    expect(dataOf(parseSavedAddressBody({}, t, { partial: true }))).toEqual({});
  });

  test("still refuses a blank address when one is sent", () => {
    expect(
      errorOf(parseSavedAddressBody({ address: " " }, t, { partial: true })),
    ).toBe("errors.savedAddresses.addressIsRequired");
  });
});

test.describe("labels and duplicate keys", () => {
  test("a blank label falls back to the address, within the label bound", () => {
    expect(resolveLabel(" Home ", "Rustaveli 12")).toBe("Home");
    expect(resolveLabel("", " Rustaveli 12 ")).toBe("Rustaveli 12");
    expect(resolveLabel("", "a".repeat(100))).toHaveLength(
      SAVED_ADDRESS_LABEL_MAX_LENGTH,
    );
  });

  test("normaliseAddressKey ignores case and whitespace runs", () => {
    expect(normaliseAddressKey("  Rustaveli   Ave\t12 ")).toBe(
      "rustaveli ave 12",
    );
    expect(normaliseAddressKey("RUSTAVELI AVE 12")).toBe(
      normaliseAddressKey("rustaveli  ave 12"),
    );
    expect(normaliseAddressKey("Rustaveli Ave 12")).not.toBe(
      normaliseAddressKey("Rustaveli Ave 13"),
    );
  });
});

test.describe("toSavedAddressDto", () => {
  const row = {
    id: "a1",
    label: "Home",
    address: "Rustaveli 12",
    lat: null,
    lng: null,
    contactName: "",
    contactPhone: "",
    buildingName: "",
    entrance: "",
    floor: 0,
    passengerElevator: false,
    cargoElevator: false,
    comment: "Code 1234",
    lastUsedAt: new Date("2026-10-16T12:00:00.000Z"),
  };

  test("serialises lastUsedAt as ISO and blanks a business comment", () => {
    expect(toSavedAddressDto(row)).toMatchObject({
      comment: "Code 1234",
      lastUsedAt: "2026-10-16T12:00:00.000Z",
    });
    expect(toSavedAddressDto(row, true).comment).toBe("");
  });
});
