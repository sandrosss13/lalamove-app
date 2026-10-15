/**
 * The booking form's per-stop "Contact Info" (pickup and drop-off): its shape,
 * the empty value, how it is read back from untrusted storage (the booking
 * draft) and how it is sent to `POST /api/orders` / `PATCH /api/orders/[id]`.
 *
 * What the dialog asks depends on the client's account type
 * (`useClientAccountType`; a guest is an individual):
 *
 * - INDIVIDUAL: name, phone, building name, entrance/staircase, floor and a
 *   comment for the driver.
 * - BUSINESS: name, phone, building name, entrance/staircase. A business's
 *   floor stays on the helper step (section 7), and it has no comment.
 *
 * The floor is NOT part of this type: it is the stop's `LocationHelp.floor`
 * (it prices helpers), which the dialog edits for an individual.
 *
 * Only pure imports, so this is safe in any client component and in the
 * Playwright pure specs.
 */

import { STOP_CONTACT_MAX_LENGTHS } from "@/lib/orders/stop-contact-limits";

/** The contact captured at one end of the route. Every part is optional. */
export type StopContact = {
  name: string;
  phone: string;
  buildingName: string;
  /** Entrance / staircase. */
  entrance: string;
  /** Note for the driver (door code, lift code…). Individuals only. */
  comment: string;
  /**
   * LEGACY free-text "block, floor or room" of an order booked before the
   * structured fields. Never edited by the dialog; carried through unchanged
   * when such an order is edited so it is not silently lost. Empty otherwise.
   */
  details: string;
};

/** A contact with nothing filled in — the draft a fresh stop starts from. */
export const EMPTY_STOP_CONTACT: StopContact = {
  name: "",
  phone: "",
  buildingName: "",
  entrance: "",
  comment: "",
  details: "",
};

/** The JSON body block for one stop, as `parseStopContact` reads it. */
export type StopContactPayload = {
  name: string;
  phone: string;
  buildingName: string;
  entrance: string;
  comment?: string;
  details?: string;
};

/**
 * One stop's contact block as the order endpoints take it, or `undefined` when
 * nothing was filled in (the dialog can be saved empty). The comment is only
 * sent for an individual — the business dialog has no comment field, and the
 * server drops one from a business client anyway.
 */
export function stopContactPayload(
  contact: StopContact | null,
  accountType: "INDIVIDUAL" | "BUSINESS",
): StopContactPayload | undefined {
  if (!contact) {
    return undefined;
  }
  const comment = accountType === "INDIVIDUAL" ? contact.comment : "";
  const anythingFilled = [
    contact.name,
    contact.phone,
    contact.buildingName,
    contact.entrance,
    comment,
    contact.details,
  ].some((value) => value.trim() !== "");
  if (!anythingFilled) {
    return undefined;
  }
  return {
    name: contact.name,
    phone: contact.phone,
    buildingName: contact.buildingName,
    entrance: contact.entrance,
    ...(comment.trim() === "" ? {} : { comment }),
    ...(contact.details.trim() === "" ? {} : { details: contact.details }),
  };
}

function readText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

/**
 * A contact read back out of untrusted storage (the booking draft), or `null`
 * when the value is not one. Parsed field by field rather than cast, each
 * part cut to its accepted length.
 */
export function readStopContact(value: unknown): StopContact | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const contact: StopContact = {
    name: readText(record.name, STOP_CONTACT_MAX_LENGTHS.name),
    phone: readText(record.phone, STOP_CONTACT_MAX_LENGTHS.phone),
    buildingName: readText(
      record.buildingName,
      STOP_CONTACT_MAX_LENGTHS.buildingName,
    ),
    entrance: readText(record.entrance, STOP_CONTACT_MAX_LENGTHS.entrance),
    comment: readText(record.comment, STOP_CONTACT_MAX_LENGTHS.comment),
    details: readText(record.details, 200),
  };
  return Object.values(contact).some((part) => part !== "") ? contact : null;
}

/** A stored order's contact columns for one stop, for re-opening the form. */
export function stopContactFromOrder(parts: {
  name: string | null;
  phone: string | null;
  buildingName: string | null;
  entrance: string | null;
  comment: string | null;
  details: string | null;
}): StopContact | null {
  const contact: StopContact = {
    name: parts.name ?? "",
    phone: parts.phone ?? "",
    buildingName: parts.buildingName ?? "",
    entrance: parts.entrance ?? "",
    comment: parts.comment ?? "",
    details: parts.details ?? "",
  };
  return Object.values(contact).some((part) => part !== "") ? contact : null;
}
