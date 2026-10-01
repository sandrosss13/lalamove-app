/**
 * The one canonical form of a sign-in phone number.
 *
 * `User.phoneNumber` is unique and Better Auth's phone plugin keys both the
 * stored code and the account lookup on the exact string it receives, so two
 * spellings of one number must normalise to one value — otherwise they are two
 * accounts. Pure function, no server.
 */

import { expect, test } from "@playwright/test";

import { isE164PhoneNumber, normalizePhoneNumber } from "@/lib/phone-number";

test.describe("normalizePhoneNumber", () => {
  const canonical = "+995555123456";

  const spellings: Record<string, string> = {
    "already canonical": "+995555123456",
    "spaced international": "+995 555 12 34 56",
    "dashes and brackets": "+995 (555) 12-34-56",
    dotted: "+995.555.123.456",
    "the 00 international prefix": "00995555123456",
    "country code without a plus": "995555123456",
    national: "555123456",
    "national with spaces": "555 12 34 56",
    "national with the old trunk zero": "0555123456",
    "surrounding whitespace": "  +995555123456\n",
  };

  for (const [name, input] of Object.entries(spellings)) {
    test(`normalises ${name}`, () => {
      expect(normalizePhoneNumber(input)).toBe(canonical);
    });
  }

  test("keeps a foreign number written internationally", () => {
    expect(normalizePhoneNumber("+44 7911 123456")).toBe("+447911123456");
    expect(normalizePhoneNumber("0044 7911 123456")).toBe("+447911123456");
  });

  const rejected: Record<string, unknown> = {
    "an empty string": "",
    "only separators": " - ",
    letters: "+995555abc456",
    "a national number that is too short": "55512345",
    "a national number that is too long": "5551234567",
    "a national number that is not a mobile": "322123456",
    "a +995 number that is too short": "+99555512345",
    "a +995 number that is too long": "+9955551234567",
    "a leading zero after the plus": "+0995555123456",
    "more than fifteen digits": "+1234567890123456",
    "a plus in the middle": "+995+555123456",
    "full-width digits": "+９９５５５５１２３４５６",
    "a number": 995555123456,
    null: null,
    undefined: undefined,
    "an object": { phoneNumber: "+995555123456" },
  };

  for (const [name, input] of Object.entries(rejected)) {
    test(`rejects ${name}`, () => {
      expect(normalizePhoneNumber(input)).toBeNull();
    });
  }

  test("is idempotent", () => {
    const once = normalizePhoneNumber("0555 12 34 56");

    expect(once).toBe(canonical);
    expect(normalizePhoneNumber(once)).toBe(once);
  });
});

test.describe("isE164PhoneNumber", () => {
  test("accepts only the canonical form", () => {
    expect(isE164PhoneNumber("+995555123456")).toBe(true);
    expect(isE164PhoneNumber("+447911123456")).toBe(true);
    expect(isE164PhoneNumber("995555123456")).toBe(false);
    expect(isE164PhoneNumber("+995 555 123 456")).toBe(false);
    expect(isE164PhoneNumber("555123456")).toBe(false);
    expect(isE164PhoneNumber("+99555512345")).toBe(false);
  });
});
