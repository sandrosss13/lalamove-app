/**
 * The sign-in code SMS: Georgian, carries the code, and fits
 * one Unicode SMS (70 characters) so each code costs a single message.
 */

import { expect, test } from "@playwright/test";

import { phoneOtpSmsBody } from "@/lib/phone-auth";

test("is Georgian and carries the code", () => {
  const body = phoneOtpSmsBody("482913");

  expect(body).toBe("ZOMO: თქვენი დასტურის კოდია 482913.");
  expect(body).toMatch(/[ა-ჿ]/);
  expect(body).not.toMatch(/verification code/i);
});

test("fits a single Unicode SMS", () => {
  expect([...phoneOtpSmsBody("999999")].length).toBeLessThanOrEqual(70);
});
