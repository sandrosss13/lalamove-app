import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Validation helpers shared by the vehicle collection route (`POST`, which
 * reads `multipart/form-data`) and the single-vehicle route (`PATCH`, which
 * reads JSON). The rules have to agree between the two — a value that is
 * rejected on create must stay rejected on edit — so they live in one place
 * rather than being duplicated per handler.
 */

/** Oldest manufacturing year accepted — anything older is almost certainly a typo. */
export const MIN_VEHICLE_YEAR = 1980;

/** Rejection message for a `vehicleTypeCode` with no matching `VehicleTypeSpec`. */
export const UNKNOWN_VEHICLE_TYPE_ERROR =
  "vehicleTypeCode does not match a known vehicle type.";

/** Trims a value and returns it only if it is a non-empty string, else null. */
export function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Parses the manufacturing year. Bounded on both ends: next year is allowed
 * because dealers register model years ahead of the calendar.
 */
export function parseYear(
  value: unknown,
): { value: number } | { error: string } {
  const raw = nonEmptyString(value);
  if (raw === null) {
    return { error: "year is required." };
  }

  const year = Number(raw);
  const maxYear = new Date().getFullYear() + 1;

  if (!Number.isInteger(year) || year < MIN_VEHICLE_YEAR || year > maxYear) {
    return {
      error: `year must be a whole number between ${MIN_VEHICLE_YEAR} and ${maxYear}.`,
    };
  }

  return { value: year };
}

/**
 * Resolves a `VehicleTypeSpec.code` to its row id, or null when no such type
 * exists. The taxonomy is seeded data rather than an enum, so unlike the other
 * helpers here this one has to hit the database — a static list would go stale
 * the moment a vehicle type is added or retired.
 */
export async function findVehicleTypeSpecIdByCode(
  code: string,
): Promise<string | null> {
  const spec = await prisma.vehicleTypeSpec.findUnique({
    where: { code },
    select: { id: true },
  });

  return spec?.id ?? null;
}

/**
 * True when `error` is a unique-constraint violation (P2002) on `plateNumber` —
 * i.e. the caller tried to register a vehicle someone already registered.
 * `meta.target` is checked so an unrelated P2002 is not mislabelled. Postgres
 * reports either the column list or the index name ("Vehicle_plateNumber_key"),
 * so both shapes are handled.
 */
export function isDuplicatePlateError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("plateNumber");
  }

  return typeof target === "string" && target.includes("plateNumber");
}
