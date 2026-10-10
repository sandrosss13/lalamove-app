/**
 * What a driver may change about their own profile from the app, pinned
 * without a server: home base and emergency contact, and nothing else.
 */

import { expect, test } from "@playwright/test";

import {
  MAX_EMERGENCY_CONTACT_NAME_LENGTH,
  parseDriverProfileUpdate,
} from "@/lib/dashboard/hub/profile-rules";

const CITIES = ["TBILISI", "BATUMI"];
const parse = (body: unknown) => parseDriverProfileUpdate(body, CITIES);

test("takes the three editable fields, trimmed and normalised", () => {
  expect(
    parse({
      city: "BATUMI",
      emergencyContactName: "  Ana Reyes ",
      emergencyContactPhone: "577 30 19 22",
    }),
  ).toEqual({
    changes: {
      city: "BATUMI",
      emergencyContactName: "Ana Reyes",
      emergencyContactPhone: "+995577301922",
    },
  });
});

test("changes only what is sent", () => {
  expect(parse({ city: "TBILISI" })).toEqual({ changes: { city: "TBILISI" } });
});

test("null or blank clears an emergency-contact field", () => {
  expect(
    parse({ emergencyContactName: null, emergencyContactPhone: "  " }),
  ).toEqual({
    changes: { emergencyContactName: null, emergencyContactPhone: null },
  });
});

test("read-only fields in the body are ignored, never applied", () => {
  expect(
    parse({
      city: "BATUMI",
      firstName: "Somebody",
      lastName: "Else",
      phone: "+995555000000",
      idNumber: "01000000000",
      activatedAt: "2026-01-01",
    }),
  ).toEqual({ changes: { city: "BATUMI" } });
  expect(parse({ firstName: "Somebody" })).toEqual({
    refusal: { reason: "NOTHING_TO_UPDATE" },
  });
});

test("refuses an unknown city, a long name and a number that is not Georgian", () => {
  expect(parse({ city: "Tbilisi" })).toEqual({
    refusal: { reason: "INVALID_CITY" },
  });
  expect(
    parse({
      emergencyContactName: "x".repeat(MAX_EMERGENCY_CONTACT_NAME_LENGTH + 1),
    }),
  ).toEqual({ refusal: { reason: "NAME_TOO_LONG" } });

  for (const phone of ["12345", "+14155550123", "577 30 19", "not a number"]) {
    expect(parse({ emergencyContactPhone: phone })).toEqual({
      refusal: { reason: "INVALID_PHONE" },
    });
  }

  expect(parse({ emergencyContactName: 7 })).toEqual({
    refusal: { reason: "NOT_TEXT", field: "emergencyContactName" },
  });
  expect(parse([])).toEqual({ refusal: { reason: "NOT_AN_OBJECT" } });
});
