/**
 * The editable half of a hub account — everything `/dashboard/account` renders
 * that `resolveHubAccount()` deliberately does not carry.
 *
 * `HubAccount` is the *chrome's* view of the signed-in user: the handful of
 * facts the sidebar, the header and every screen guard need, resolved once and
 * kept deliberately small because it is handed to every client component in the
 * hub. The account screen needs a different, wider set — the identity columns a
 * driver may correct, the read-only ones collected during onboarding, and (for
 * a fleet) the payout account — and only one screen needs them. Loading them
 * here rather than widening `HubAccount` keeps that cost on the one page that
 * asks for it.
 *
 * Server-only: it reads the Better Auth session and talks to Prisma. Everything
 * returned is plain serialisable data — no `Date`, no Prisma model, no enum
 * imported from `@prisma/client` — because it crosses straight into
 * `"use client"` form components, exactly as `HubAccount` does.
 */
import "server-only";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import { requireDashboardSession } from "@/lib/dashboard/auth";
import { formatCity } from "@/lib/format-city";
import { prisma } from "@/lib/prisma";

/** How many trailing IBAN characters are safe to print. */
const IBAN_VISIBLE_CHARS = 4;

/**
 * What a driver session can see and change about itself.
 *
 * `accountType` and `city` are enum values (`DriverAccountType`,
 * `GeorgianCity`) carried as bare strings: the form posts them back to `POST
 * /api/driver-profile`, which re-validates both against the real enums, and a
 * client component that imported the generated enum would drag Prisma into the
 * browser bundle — the same reason `src/lib/georgian-cities.ts` restates the
 * city list by hand.
 */
export type HubDriverAccountSettings = {
  shape: "DRIVER";
  /** Sign-in identity, owned by Better Auth rather than by this profile. */
  email: string;
  /** `DriverAccountType` value. Frozen at sign-up; never editable here. */
  accountType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  vatId: string | null;
  phone: string;
  /** `GeorgianCity` value — the `<select>`'s current selection. */
  city: string;
  /**
   * Both collected by the onboarding wizard and verified against an uploaded
   * document, and neither writable through any endpoint afterwards — so the
   * account screen shows them and does not offer to change them.
   * `dateOfBirth` is pre-reduced to "YYYY-MM-DD"; the instant is not needed.
   */
  idNumber: string | null;
  dateOfBirth: string | null;
};

/**
 * What a fleet-owner session can see about itself.
 *
 * Read-only by design — see the note on `driver-account-company-card.tsx` for
 * why this screen does not re-use `POST /api/logistics-company`.
 */
export type HubCompanyAccountSettings = {
  shape: "COMPANY";
  email: string;
  companyName: string;
  vatId: string;
  phone: string;
  /** Already humanised — nothing here feeds a `<select>`. */
  city: string;
  registeredAddress: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  /**
   * The last four characters of `LogisticsCompany.bankAccountIban`, or `null`
   * when the fleet wizard never collected one.
   *
   * **The only real payout fact in this codebase.** A driver has no bank
   * column at all, which is why the payout panel is sampled for every persona
   * but this one. Truncated here, in the server module, so the full IBAN never
   * reaches the browser for a screen that only ever prints four characters.
   */
  payoutIbanLast4: string | null;
};

export type HubAccountSettings =
  HubDriverAccountSettings | HubCompanyAccountSettings;

/**
 * The last four characters of an IBAN, ignoring the spaces a human may have
 * typed into it. `null` for a missing or implausibly short value rather than a
 * partial mask, which would leak how little was stored.
 */
function ibanLast4(iban: string | null): string | null {
  if (iban === null) {
    return null;
  }

  const compact = iban.replace(/\s+/g, "").toUpperCase();

  return compact.length < IBAN_VISIBLE_CHARS
    ? null
    : compact.slice(-IBAN_VISIBLE_CHARS);
}

/**
 * Loads the account-screen fields for the already-resolved `account`.
 *
 * Returns `null` on the same terms `resolveHubAccount()` does — an interrupted
 * sign-up whose profile row was never created — though in practice the `(hub)`
 * layout has already rendered its own fallback for that case, so the page's
 * handling of `null` is narrowing rather than a second fallback.
 *
 * The session is re-read for the email only; `requireDashboardSession()` is
 * React-`cache()`d and the layout above has already called it, so this costs no
 * second validation.
 */
export async function getHubAccountSettings(
  account: HubAccount,
): Promise<HubAccountSettings | null> {
  const session = await requireDashboardSession();
  const { email } = session.user;

  if (account.kind === "BUSINESS") {
    const company = await prisma.logisticsCompany.findUnique({
      where: { userId: account.userId },
      select: {
        companyName: true,
        vatId: true,
        phone: true,
        city: true,
        registeredAddress: true,
        contactName: true,
        contactRole: true,
        contactEmail: true,
        bankAccountIban: true,
      },
    });

    if (company === null) {
      return null;
    }

    return {
      shape: "COMPANY",
      email,
      companyName: company.companyName,
      vatId: company.vatId,
      phone: company.phone,
      city: formatCity(company.city),
      registeredAddress: company.registeredAddress,
      contactName: company.contactName,
      contactRole: company.contactRole,
      contactEmail: company.contactEmail,
      payoutIbanLast4: ibanLast4(company.bankAccountIban),
    };
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: account.userId },
    select: {
      accountType: true,
      firstName: true,
      lastName: true,
      companyName: true,
      vatId: true,
      phone: true,
      city: true,
      idNumber: true,
      dateOfBirth: true,
    },
  });

  if (driverProfile === null) {
    return null;
  }

  return {
    shape: "DRIVER",
    email,
    accountType: driverProfile.accountType,
    firstName: driverProfile.firstName,
    lastName: driverProfile.lastName,
    companyName: driverProfile.companyName,
    vatId: driverProfile.vatId,
    phone: driverProfile.phone,
    city: driverProfile.city,
    idNumber: driverProfile.idNumber,
    // `<input type="date">`'s value format, and the only part of the instant
    // this screen prints.
    dateOfBirth: driverProfile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
  };
}
