/**
 * Who is signed in, in the one shape every Driver Hub screen renders from.
 *
 * The hub's shell (sidebar, header, account chip) and each of its seven pages
 * all need the same handful of facts: which kind of account this is, which of
 * the three personas it is, what to print in the avatar block, and whether the
 * online toggle may be operated. Resolving that once, here, is what keeps the
 * nav, the header and the server-side page guards from disagreeing with each
 * other — nav filtering is cosmetic, the Drivers/Employees pages re-derive
 * their business-only guard from this same `kind`, and every screen withheld
 * from a roster driver re-derives its guard from this same `persona`.
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
 *
 * This is the *coarse* axis: which shell to render, and the one the Vehicles
 * and Loads screens already consume by name (`HubVehiclesData.kind`,
 * `LoadsScreen`'s `accountKind` prop). The finer axis is `HubPersona` below,
 * which splits INDIVIDUAL into the driver who owns their work and the driver
 * on somebody else's roster. A screen that must tell those two apart reads
 * `HubAccount.persona`; this stays for the screens that genuinely only care
 * which of the two shells they are in.
 */
export type HubAccountKind = "BUSINESS" | "INDIVIDUAL";

/**
 * Which of the three registered-driver account shapes this is — the hub's
 * first-class account axis, and the one every loader and screen branches on.
 *
 * | Persona       | `kind`         | `companyId`                 |
 * |---------------|----------------|-----------------------------|
 * | `INDEPENDENT` | `"INDIVIDUAL"` | `null`                      |
 * | `ROSTER`      | `"INDIVIDUAL"` | set — their *employer*      |
 * | `BUSINESS`    | `"BUSINESS"`   | set — their *own* company   |
 *
 * An `INDEPENDENT` driver owns their vehicle and keeps their own fares. A
 * `ROSTER` driver is employed: their company's dispatch reaches them as well as
 * the open board, which they browse and claim from like any other driver, and
 * the fares they collect are paid to their employer — which is why the Wallet
 * is withheld from them, not merely relabelled. A `BUSINESS` account is the
 * fleet owner, and is the only shape that gets the Drivers and Employees
 * screens.
 *
 * **`companyId !== null` is not, on its own, the roster test.** A BUSINESS
 * account's `companyId` names *its own* company, so the roster case is the
 * conjunction `kind === "INDIVIDUAL" && companyId !== null` and nothing less.
 * Reading `companyId` alone would classify every fleet owner as one of their
 * own employees and would withhold the Wallet from exactly the accounts it
 * exists to serve.
 *
 * Deliberately *not* `DriverProfile.accountType` (`DriverAccountType`), which
 * is a different axis entirely: a sole-proprietor driver who registered as a
 * business is still `kind: "INDIVIDUAL"` and, with no employer, persona
 * `INDEPENDENT`. Branch on this; never on `accountType`.
 *
 * Derived once, in `resolveHubAccount()` below, which is React-`cache()`d — so
 * the derivation costs nothing per request and a screen reads
 * `account.persona` rather than re-deriving the conjunction at the point of
 * use. Two sites deriving it independently is precisely how the sidebar and a
 * page guard drift apart.
 */
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";

export type HubAccount = {
  kind: HubAccountKind;
  /**
   * The three-way account shape — see `HubPersona` above.
   *
   * Added *alongside* `kind`, never in place of it: `HubVehiclesData.kind` and
   * `LoadsScreen`'s `accountKind` prop already consume the two-way axis by
   * name, and collapsing them into this one would be a rename with no
   * behavioural gain. Screens that need to tell an employed driver from an
   * independent one read this; screens that only need to know which shell they
   * are in keep reading `kind`.
   */
  persona: HubPersona;
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
  /**
   * Whether operations have approved this account to work — a driver's
   * `DriverProfile.activatedAt`, or a fleet's `LogisticsCompany.activatedAt`,
   * each reduced to `!== null`.
   *
   * **This is the account-kind-agnostic activation fact, and it is deliberately
   * a separate field from `canToggleOnline` rather than a generalisation of
   * it.** The two happen to coincide for a driver and diverge for a company: a
   * company is `canToggleOnline: false` because a fleet has no online toggle at
   * all, not because it is unapproved, so an activated company reading
   * `canToggleOnline` would look unapproved and a caller generalising that
   * field would silently gate the wrong thing. Callers that ask "may this
   * account be offered work?" — the load board's empty-board short-circuit, and
   * the claim/reject routes' 403s that it must agree with — read this; callers
   * that ask "may this UI control be operated?" read `canToggleOnline`.
   *
   * A `Date` is deliberately not exposed: `HubAccount` is handed straight to
   * `"use client"` components, and no consumer needs the instant, only the
   * verdict — the same reduction the INDIVIDUAL branch has always done.
   */
  isActivated: boolean;
  /**
   * Whether the header's online toggle may be operated: a driver may only go
   * online once activated, and a company never can because it has no toggle.
   * Driver-specific by meaning — see `isActivated` for the activation fact
   * itself, which is what a work-eligibility gate wants.
   */
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
        // Read for `isActivated` below. A fleet under review may sign in and
        // look around, but may not be offered work — `POST
        // /api/logistics-company/orders/[id]/claim` and `POST
        // /api/loads/[id]/reject` both 403 on a null `activatedAt`, so any
        // surface that lists claimable work has to know this too or it
        // advertises work those routes refuse.
        activatedAt: true,
      },
    });

    if (!company) {
      return null;
    }

    return {
      kind: "BUSINESS",
      // A `LogisticsCompany` session *is* the fleet owner, so the persona is
      // fixed by the branch rather than derived within it — there is no
      // conjunction to evaluate here. Note that `companyId` below names this
      // account's *own* company, which is exactly why the roster test in the
      // driver branch has to be conjoined with `kind` and can never read
      // `companyId` alone.
      persona: "BUSINESS",
      userId,
      displayName: company.companyName,
      initials: initialsOf(company.companyName),
      // A fleet has no vehicle class of its own, so the design's mono subline
      // carries the registered VAT id instead — the one identifier a company
      // is actually known by.
      identifier: company.vatId,
      city: formatCity(company.city),
      // Same reduction as the driver branch below, off the company's own
      // approval column — the gate `POST /api/logistics-company/orders/[id]/
      // claim` and `POST /api/loads/[id]/reject` enforce.
      isActivated: company.activatedAt !== null,
      // A company account is not a driver: there is nothing to take online,
      // and `PATCH /api/driver-profile/status` rejects a COMPANY session
      // outright. Both fields say so rather than defaulting to a falsy driver
      // state that would render a toggle the API would refuse.
      //
      // Note this is `false` for an *activated* company too, which is why
      // `isActivated` exists beside it rather than callers reusing this one.
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
    // A fleet-affiliated driver is still an individual-shaped *hub*: they
    // drive, they do not manage a roster, so both kinds of driver share this
    // shell and `kind` cannot tell them apart. That is what `persona` is for.
    kind: "INDIVIDUAL",
    // `companyId` names this driver's **employer** here — contrast the
    // BUSINESS branch above, where it names the account's own company. What it
    // decides is which screens this driver gets: through the persona it
    // withholds the Wallet (the fares they collect are paid to their employer,
    // so a personal earnings total would assert something false about whose
    // money it is). The board is not among them — it is every driver's home
    // screen, employed or not.
    //
    // `kind` is `"INDIVIDUAL"` for everything reaching this branch, so the
    // conjunction the roster test requires is already satisfied structurally
    // and this null check is the whole of it *here*. It is not the whole of it
    // anywhere else — see `HubPersona`.
    persona: driverProfile.companyId === null ? "INDEPENDENT" : "ROSTER",
    userId,
    displayName: personName,
    initials: initialsOf(personName),
    identifier: driverIdentifier(vehicleTypeLabel, cityLabel),
    city: cityLabel,
    isOnline: driverProfile.isOnline,
    // The gate `POST /api/orders/[id]/accept` and `POST /api/loads/[id]/reject`
    // enforce: an unapproved driver may not be offered work.
    isActivated: driverProfile.activatedAt !== null,
    // Mirrors the gate `PATCH /api/driver-profile/status` enforces: only an
    // activated driver may go online. Surfacing it here means the toggle is
    // disabled in the UI rather than offering an action the API would 403.
    //
    // Identical to `isActivated` for a driver *today*, and still kept separate:
    // they answer different questions and only one of them is about a toggle.
    canToggleOnline: driverProfile.activatedAt !== null,
    companyName: driverProfile.company?.companyName ?? null,
    driverProfileId: driverProfile.id,
    companyId: driverProfile.companyId,
  };
});
