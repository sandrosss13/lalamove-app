/**
 * The contact a **guest** — someone booking without an account — must leave
 * before they can pay: first name, last name and phone, plus an optional email.
 *
 * An account order reads its contact from the client's `User` row; a guest
 * order has no such row, so this is the only way anyone (support, the driver,
 * the admin console) can reach the person who booked. That is why checkout
 * refuses to take a guest's payment without it, on both sides: the checkout
 * page keeps its Pay button disabled until this parser accepts the form, and
 * `POST /api/orders/[id]/pay` runs the very same parser on the body and writes
 * the result onto the order in the same transaction as the payment.
 *
 * **Pure, and must stay pure.** The checkout page imports this into the
 * browser bundle for its inline validation, so it may not import `server-only`,
 * Prisma, `next/headers` or anything else that cannot run in a browser. Its one
 * dependency, `normalizePhoneNumber`, is itself a pure string function.
 *
 * **No OTP.** The phone is checked for shape only — normalised to E.164, the
 * form `User.phoneNumber` stores — and never verified. A guest who mistypes it
 * has given support a wrong number; nothing here can know.
 *
 * Errors are **field-keyed codes**, not translated sentences: the browser
 * renders them under the matching input in the reader's language, and the
 * server returns the same codes as `fieldErrors` beside one translated
 * `error`. A code rather than a message also keeps this module free of the
 * translator, which would otherwise be the one server import it needs.
 */

import { normalizePhoneNumber } from "@/lib/phone-number";

/** Longest accepted first or last name. Generous for any real name, and short
 *  enough that the field cannot be used to store an essay on the order. */
export const GUEST_NAME_MAX_LENGTH = 100;

/** RFC 5321's limit on a forward path; no deliverable address is longer. */
export const GUEST_EMAIL_MAX_LENGTH = 254;

/**
 * A deliberately loose shape check: something, an `@`, something with a dot in
 * it, and no whitespace anywhere. Nothing sends email to this address — the app
 * has no email sending — so the check exists to catch a typo that put a phone
 * number or a name in the wrong box, not to rule on RFC 5322.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A guest's contact in its stored form: trimmed, phone in E.164, a blank
 *  email collapsed to `null`. */
export type GuestContactInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
};

/** Why one field was refused. `required` — missing or blank; `invalid` —
 *  present but not acceptable (too long, not a phone number, not an email). */
export type GuestContactFieldError = "required" | "invalid";

/** Every refused field, keyed by its `GuestContactInput` name. */
export type GuestContactErrors = Partial<
  Record<keyof GuestContactInput, GuestContactFieldError>
>;

/** Trim a value that should be a string; anything else reads as absent. */
function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A required name field: present, and no longer than the cap. */
function checkName(value: string): GuestContactFieldError | null {
  if (value === "") {
    return "required";
  }

  return value.length > GUEST_NAME_MAX_LENGTH ? "invalid" : null;
}

/**
 * Validate a guest's contact form, reporting **every** refused field at once
 * rather than stopping at the first — the checkout form shows each error under
 * its own input, and a guest fixing one field only to be told about the next
 * would be fixing them one round-trip at a time.
 *
 * Accepts anything (`unknown`): the server feeds it a decoded JSON body, the
 * browser its form state. A non-object is every required field missing.
 */
export function parseGuestContact(
  raw: unknown,
): { data: GuestContactInput } | { errors: GuestContactErrors } {
  const fields =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const errors: GuestContactErrors = {};

  const firstName = trimmedString(fields.firstName);
  const firstNameError = checkName(firstName);
  if (firstNameError) {
    errors.firstName = firstNameError;
  }

  const lastName = trimmedString(fields.lastName);
  const lastNameError = checkName(lastName);
  if (lastNameError) {
    errors.lastName = lastNameError;
  }

  const rawPhone = trimmedString(fields.phone);
  const phone = rawPhone === "" ? null : normalizePhoneNumber(rawPhone);
  if (rawPhone === "") {
    errors.phone = "required";
  } else if (phone === null) {
    errors.phone = "invalid";
  }

  // Optional: absent, `null` and blank all mean "no email". Anything that is
  // present but not a string is a malformed body, not a missing field.
  let email: string | null = null;
  if (fields.email !== undefined && fields.email !== null) {
    if (typeof fields.email !== "string") {
      errors.email = "invalid";
    } else {
      const trimmed = fields.email.trim();
      if (trimmed !== "") {
        if (
          trimmed.length > GUEST_EMAIL_MAX_LENGTH ||
          !EMAIL_SHAPE.test(trimmed)
        ) {
          errors.email = "invalid";
        } else {
          email = trimmed;
        }
      }
    }
  }

  if (Object.keys(errors).length > 0 || phone === null) {
    return { errors };
  }

  return { data: { firstName, lastName, phone, email } };
}
