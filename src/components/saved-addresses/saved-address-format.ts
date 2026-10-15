/**
 * Pure helpers shared by the after-booking "save these addresses?" prompt and
 * the `/account/saved-addresses` manage page: how two addresses are compared,
 * how a stop's contact details are summarised in one line, and how the API's
 * `{ error }` wording is read back out of a failed response.
 *
 * Only pure imports, so this is safe in client components and in the
 * Playwright pure specs (`tests/saved-addresses-prompt-rules.spec.ts`).
 */

import type { SavedAddressInput } from "@/lib/saved-addresses/contract";

/** The contact fields a summary reads — everything but label and position. */
export type SavedAddressContact = Pick<
  SavedAddressInput,
  | "contactName"
  | "contactPhone"
  | "buildingName"
  | "entrance"
  | "floor"
  | "passengerElevator"
  | "cargoElevator"
  | "comment"
>;

/** A `useTranslations("savedAddresses.contactSummary")` function, narrowed. */
export type ContactSummaryTranslator = (
  key: "entrance" | "floor" | "passengerElevator" | "cargoElevator",
  values?: Record<string, string | number>,
) => string;

/**
 * The key two addresses are compared by: trimmed, inner whitespace collapsed,
 * lower-cased. The same rule the API applies when it folds a duplicate POST
 * into the existing row (see `contract.ts`), so a row this hides is exactly a
 * row the server would have treated as already saved.
 */
export function addressKey(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The parts of a one-line contact summary, in reading order, empty fields
 * left out. The ground floor is not mentioned — it is the default every stop
 * starts at, so naming it on every row would only be noise.
 */
export function contactSummaryParts(
  contact: SavedAddressContact,
  t: ContactSummaryTranslator,
): string[] {
  const parts: string[] = [];
  const name = contact.contactName.trim();
  const phone = contact.contactPhone.trim();
  const building = contact.buildingName.trim();
  const entrance = contact.entrance.trim();

  if (name) parts.push(name);
  if (phone) parts.push(phone);
  if (building) parts.push(building);
  if (entrance) parts.push(t("entrance", { entrance }));
  if (contact.floor > 0) parts.push(t("floor", { floor: contact.floor }));
  if (contact.passengerElevator) parts.push(t("passengerElevator"));
  if (contact.cargoElevator) parts.push(t("cargoElevator"));

  return parts;
}

/**
 * The ends of a just-booked order still worth offering: those with an address,
 * not already among the client's saved ones, and — when pickup and drop-off
 * are the same place — only the first of the two.
 */
export function unsavedEnds<E extends { input: { address: string } }>(
  ends: E[],
  savedAddresses: string[],
): E[] {
  const seen = new Set(savedAddresses.map(addressKey));
  const result: E[] = [];

  for (const end of ends) {
    const key = addressKey(end.input.address);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(end);
  }

  return result;
}

/**
 * Pulls the API's own `{ error }` wording out of a failed response, so a client
 * reads the reason the server gave (the limit message on a 409, the field on a
 * 400) rather than a generic failure. Falls back when the body is missing,
 * unparseable or carries no message.
 */
export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string" &&
    (body as { error: string }).error !== ""
  ) {
    return (body as { error: string }).error;
  }

  return fallback;
}

/** `GET /api/saved-addresses`'s address strings, or `null` if unreadable. */
export function readSavedAddressList(
  body: unknown,
): { address: string }[] | null {
  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray((body as { addresses?: unknown }).addresses)
  ) {
    return null;
  }

  return (body as { addresses: unknown[] }).addresses.filter(
    (row): row is { address: string } =>
      typeof row === "object" &&
      row !== null &&
      typeof (row as { address?: unknown }).address === "string",
  );
}

/** The quick-pick label chips; keys in `savedAddresses.labels`. */
export const LABEL_CHIP_KEYS = ["home", "office", "warehouse"] as const;
