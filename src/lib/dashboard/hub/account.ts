/**
 * Who is signed in, in the one shape every Driver Hub screen renders from.
 *
 * The hub's shell (sidebar, header, account chip) and each of its seven pages
 * all need the same handful of facts: which kind of account this is, what to
 * print in the avatar block, and whether the online toggle may be operated.
 * Resolving that once, here, is what keeps the nav, the header and the
 * server-side page guards from disagreeing with each other — nav filtering is
 * cosmetic, and the Drivers/Employees pages re-derive their business-only
 * guard from this same `kind`.
 *
 * Server-only: it reads the Better Auth session and talks to Prisma. The
 * returned object is handed straight into `"use client"` components, so every
 * field on it is plain serialisable data — no `Date`, no Prisma model.
 */
import "server-only";

import { cache } from "react";

import { requireDashboardSession } from "@/lib/dashboard/auth";
import { formatCity } from "@/lib/format-city";
import { prisma } from "@/lib/prisma";

/**
 * Which of the two hub shapes to render.
 *
 * Deliberately *not* the same axis as `DriverAccountType`: a driver who signed
 * up as a BUSINESS is still one person driving, and a driver on a fleet's
 * roster is too. Only a `LogisticsCompany` session — the fleet owner — gets the
 * business hub with its Drivers and Employees screens.
 */
export type HubAccountKind = "BUSINESS" | "INDIVIDUAL";

export type HubAccount = {
  kind: HubAccountKind;
  userId: string;
  /** Person's full name, or the company name for a COMPANY session. */
  displayName: string;
  /** Up to two uppercase initials for the avatar circle. */
  initials: string;
  /** Mono subline under the name, e.g. "Van · Tbilisi" or a VAT id. */
  identifier: string;
  /** Home city label, already humanised from the GeorgianCity enum. */
  city: string;
  /** Current online state; null for a COMPANY session, which has none. */
  isOnline: boolean | null;
  /** A driver may only go online once activated; false for a company. */
  canToggleOnline: boolean;
  /** Set when a DRIVER belongs to a fleet. */
  companyName: string | null;
  driverProfileId: string | null;
  companyId: string | null;
};

/** Fallback initial when a name has no usable word characters at all. */
const UNKNOWN_INITIALS = "?";

/** The separator the design uses between the two halves of the subline. */
const IDENTIFIER_SEPARATOR = " · ";

/**
 * "Nino Abashidze" → "NA": first letters of the first and last words, capped at
 * two because the avatar circle is a fixed 36px and a third letter overflows
 * it. Mirrors `initialsOf` in the fleet-onboarding driver step, which solves
 * exactly this for the same 36px circle.
 */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  // `noUncheckedIndexedAccess` — an all-whitespace name yields no words at all.
  const first = words[0];
  if (first === undefined) {
    return UNKNOWN_INITIALS;
  }

  const last = words[words.length - 1];
  const second = words.length > 1 && last !== undefined ? last : "";

  return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase();
}

/**
 * The mono subline for a driver: "Cargo Van · Tbilisi", or just the city when
 * we cannot name a vehicle.
 *
 * The design's subline is "<vehicle class> · <city>", so the vehicle type has
 * to come from somewhere. It is read from two places because the two kinds of
 * driver hold vehicles differently: an independent driver owns rows on
 * `Vehicle.driverProfileId`, while a fleet driver drives a company-owned
 * vehicle reachable only through an open `DriverVehicleAssignment`. A driver
 * mid-onboarding may legitimately have neither, which is why the city alone is
 * a valid answer rather than a placeholder.
 */
function driverIdentifier(
  vehicleTypeLabel: string | undefined,
  cityLabel: string,
): string {
  return vehicleTypeLabel === undefined
    ? cityLabel
    : `${vehicleTypeLabel}${IDENTIFIER_SEPARATOR}${cityLabel}`;
}

/**
 * Resolves the signed-in user into the hub's account shape, or `null` when the
 * matching profile/company row does not exist yet.
 *
 * `null` is not an error: sign-up creates the row, so it only happens when
 * onboarding was interrupted part-way. The layout owns that fallback — deciding
 * here what to render would tie this module to a particular UI, the same
 * reasoning `getDriverDashboardData()` gives for its own `null`.
 *
 * Wrapped in React's `cache()` for the same reason `requireDashboardSession()`
 * is: the hub layout resolves the account to render the shell, and the page
 * beneath it resolves it again to decide what it may show. `cache()` collapses
 * those to one query within a single request's render pass. It is per-request
 * memoization only — never shared across requests or users.
 */
export const resolveHubAccount = cache(async (): Promise<HubAccount | null> => {
  const session = await requireDashboardSession();
  const { id: userId } = session.user;

  // CLIENT is already redirected away by the guard, so the only roles that
  // reach here are COMPANY, DRIVER and the back-office roles. Everything that
  // is not a COMPANY is resolved through the driver branch below, which
  // returns `null` for a user with no `DriverProfile` — the correct answer for
  // an admin who wandered in, and the same one the layout's fallback handles.
  if (session.user.role === "COMPANY") {
    const company = await prisma.logisticsCompany.findUnique({
      where: { userId },
      select: {
        id: true,
        companyName: true,
        vatId: true,
        city: true,
      },
    });

    if (!company) {
      return null;
    }

    return {
      kind: "BUSINESS",
      userId,
      displayName: company.companyName,
      initials: initialsOf(company.companyName),
      // A fleet has no vehicle class of its own, so the design's mono subline
      // carries the registered VAT id instead — the one identifier a company
      // is actually known by.
      identifier: company.vatId,
      city: formatCity(company.city),
      // A company account is not a driver: there is nothing to take online,
      // and `PATCH /api/driver-profile/status` rejects a COMPANY session
      // outright. Both fields say so rather than defaulting to a falsy driver
      // state that would render a toggle the API would refuse.
      isOnline: null,
      canToggleOnline: false,
      companyName: company.companyName,
      driverProfileId: null,
      companyId: company.id,
    };
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      city: true,
      isOnline: true,
      activatedAt: true,
      companyId: true,
      firstName: true,
      lastName: true,
      user: { select: { name: true } },
      company: { select: { companyName: true } },
      // Own vehicles first (an independent driver), then the fleet vehicle
      // currently assigned to them. Both are capped at one row: the subline
      // shows a single class, and the hub never needs the rest of the fleet.
      vehicles: {
        select: { vehicleTypeSpec: { select: { label: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      assignments: {
        where: { unassignedAt: null },
        select: {
          vehicle: { select: { vehicleTypeSpec: { select: { label: true } } } },
        },
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!driverProfile) {
    return null;
  }

  // `DriverProfile.firstName`/`lastName` are only filled in by the onboarding
  // wizard, so `User.name` is the fallback that always exists — it is set at
  // sign-up for every path, including company-registered drivers.
  const personName =
    [driverProfile.firstName, driverProfile.lastName]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" ")
      .trim() || driverProfile.user.name;

  const cityLabel = formatCity(driverProfile.city);
  const vehicleTypeLabel =
    driverProfile.vehicles[0]?.vehicleTypeSpec.label ??
    driverProfile.assignments[0]?.vehicle.vehicleTypeSpec.label;

  return {
    // A fleet-affiliated driver is still an individual-shaped hub: they drive,
    // they do not manage a roster. `companyId` only decides whether the header
    // names their company, never which screens they get.
    kind: "INDIVIDUAL",
    userId,
    displayName: personName,
    initials: initialsOf(personName),
    identifier: driverIdentifier(vehicleTypeLabel, cityLabel),
    city: cityLabel,
    isOnline: driverProfile.isOnline,
    // Mirrors the gate `PATCH /api/driver-profile/status` enforces: only an
    // activated driver may go online. Surfacing it here means the toggle is
    // disabled in the UI rather than offering an action the API would 403.
    canToggleOnline: driverProfile.activatedAt !== null,
    companyName: driverProfile.company?.companyName ?? null,
    driverProfileId: driverProfile.id,
    companyId: driverProfile.companyId,
  };
});
