/**
 * The sign-in code SMS: Georgian, carries the code and its lifetime, and fits
 * one Unicode SMS (70 characters) so each code costs a single message.
 */

import { expect, test } from "@playwright/test";

import { phoneOtpSmsBody } from "@/lib/phone-auth";

test("is Georgian, carries the code and the lifetime", () => {
  const body = phoneOtpSmsBody("482913", 5);

  expect(body).toBe("ZOMO: თქვენი დადასტურების კოდია 482913. მოქმედებს 5 წუთი.");
  expect(body).toMatch(/[ა-ჿ]/);
  expect(body).not.toMatch(/verification code/i);
});

test("fits a single Unicode SMS", () => {
  expect([...phoneOtpSmsBody("999999", 10)].length).toBeLessThanOrEqual(70);
});
