/**
 * The driver personal-ID rule a logistics company is held to, shared by the two
 * routes that write `DriverProfile.idNumber` on a company's behalf:
 *
 * - `POST /api/logistics-company/drivers/register`, where it is **required** —
 *   a client's order-details PDF prints the carrying driver's personal number,
 *   so every driver a company adds from now on brings one; and
 * - `PATCH /api/logistics-company/drivers/[userId]`, where the company fills it
 *   in (or corrects it) for a driver already on its roster.
 *
 * Pure — no `server-only`, no Prisma — so `tests/driver-personal-id.spec.ts`
 * can exercise it without a server or a database, and so the add panel could
 * import the same rule client-side if it ever needed to.
 *
 * Returns a reason code rather than a translated message: the two routes phrase
 * the refusal under their own error namespaces
 * (`errors.logisticsCompanyDriversRegister.*` and
 * `errors.logisticsCompanyDrivers.*`), and the rule itself should not care
 * which one asked.
 *
 * ## The format
 *
 * Exactly 11 digits after trimming — a Georgian personal number
 * (პირადი ნომერი), via `isGeorgianPersonalNumber` in
 * `src/lib/orders/service-document.ts`, the module that prints it. Nothing else
 * is normalised: an inner space or a dash is refused rather than stripped,
 * because a number that needed repairing is one the admin should look at again
 * before it lands on a legal-looking document.
 *
 * Deliberately stricter than the self-serve onboarding wizard's
 * `ID_NUMBER_PATTERN` (6–20 letters, digits or hyphens), which still admits
 * foreign documents. Foreign drivers on a company roster are out of scope for
 * the order-details PDF; widening this later is a one-line change here.
 */
import { isGeorgianPersonalNumber } from "@/lib/orders/service-document";

/** Why a submitted personal ID was refused. */
export type DriverPersonalIdError = "required" | "invalid";

/**
 * Validates a raw request value as a driver's personal ID.
 *
 * Absent, `null`, or blank after trimming → `"required"`; anything else that
 * is not a string of exactly 11 digits → `"invalid"`. A JSON number is refused
 * as invalid rather than coerced: it has already lost any leading zero, and
 * personal numbers can start with one.
 */
export function parseDriverPersonalId(
  value: unknown,
): { idNumber: string } | { error: DriverPersonalIdError } {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return { error: "required" };
  }

  if (typeof value !== "string") {
    return { error: "invalid" };
  }

  const idNumber = value.trim();
  if (!isGeorgianPersonalNumber(idNumber)) {
    return { error: "invalid" };
  }

  return { idNumber };
}
