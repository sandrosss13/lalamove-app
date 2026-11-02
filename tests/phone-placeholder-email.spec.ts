/**
 * The placeholder address a phone-number account is created with
 * (`<digits>@phone.driver-app.invalid`) must never be shown to anyone:
 * `src/lib/phone-placeholder-email.ts` recognises it, and `displayEmail` turns
 * it — or an empty address — into `null` for the screens to render as nothing.
 *
 * **Why this runs with no browser and no database**: the module imports
 * nothing, and `orderClientDisplay` imports only it.
 */

import { expect, test } from "@playwright/test";

import { orderClientDisplay } from "@/lib/orders/order-client-display";
import {
  PHONE_PLACEHOLDER_EMAIL_DOMAIN,
  displayEmail,
  isPhonePlaceholderEmail,
} from "@/lib/phone-placeholder-email";

const PLACEHOLDER = `995555123456@${PHONE_PLACEHOLDER_EMAIL_DOMAIN}`;

test.describe("isPhonePlaceholderEmail", () => {
  test("recognises the placeholder domain", () => {
    expect(PHONE_PLACEHOLDER_EMAIL_DOMAIN).toBe("phone.driver-app.invalid");
    expect(isPhonePlaceholderEmail(PLACEHOLDER)).toBe(true);
  });

  test("ignores case and surrounding whitespace", () => {
    expect(
      isPhonePlaceholderEmail("  995555123456@PHONE.Driver-App.INVALID "),
    ).toBe(true);
  });

  test("a real address is not a placeholder", () => {
    expect(isPhonePlaceholderEmail("nino@example.com")).toBe(false);
    // Only the exact domain after the `@`, not a look-alike.
    expect(isPhonePlaceholderEmail("x@notphone.driver-app.invalid")).toBe(
      false,
    );
    expect(isPhonePlaceholderEmail("phone.driver-app.invalid")).toBe(false);
  });

  test("non-strings are not placeholders", () => {
    expect(isPhonePlaceholderEmail(null)).toBe(false);
    expect(isPhonePlaceholderEmail(undefined)).toBe(false);
    expect(isPhonePlaceholderEmail(42)).toBe(false);
  });
});

test.describe("displayEmail", () => {
  test("a real address is shown, trimmed", () => {
    expect(displayEmail("nino@example.com")).toBe("nino@example.com");
    expect(displayEmail("  nino@example.com ")).toBe("nino@example.com");
  });

  test("a placeholder is never shown", () => {
    expect(displayEmail(PLACEHOLDER)).toBeNull();
    expect(displayEmail(PLACEHOLDER.toUpperCase())).toBeNull();
  });

  test("an empty or missing address shows nothing", () => {
    expect(displayEmail("")).toBeNull();
    expect(displayEmail("   ")).toBeNull();
    expect(displayEmail(null)).toBeNull();
    expect(displayEmail(undefined)).toBeNull();
  });
});

test.describe("orderClientDisplay", () => {
  const guestless = {
    guestFirstName: null,
    guestLastName: null,
    guestPhone: null,
    guestEmail: null,
  };

  test("a phone account's placeholder is hidden; its number is offered", () => {
    const display = orderClientDisplay({
      ...guestless,
      client: {
        name: "Nino",
        email: PLACEHOLDER,
        phoneNumber: "+995555123456",
      },
    });
    expect(display.email).toBeNull();
    expect(display.phone).toBe("+995555123456");
  });

  test("a real account address passes through", () => {
    const display = orderClientDisplay({
      ...guestless,
      client: { name: "Nino", email: "nino@example.com" },
    });
    expect(display.email).toBe("nino@example.com");
    expect(display.phone).toBeNull();
  });
});
