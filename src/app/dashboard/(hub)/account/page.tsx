import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DriverAccountCompanyCard } from "@/components/driver-hub/driver-account-company-card";
import { DriverAccountPasswordCard } from "@/components/driver-hub/driver-account-password-card";
import { DriverAccountPayoutPanel } from "@/components/driver-hub/driver-account-payout-panel";
import { DriverAccountPlaceholderPanel } from "@/components/driver-hub/driver-account-placeholder-panel";
import { DriverAccountProfileForm } from "@/components/driver-hub/driver-account-profile-form";
import { DriverAccountSidebar } from "@/components/driver-hub/driver-account-sidebar";
import {
  DRIVER_ACCOUNT_SECTION_PARAM,
  driverAccountSection,
  driverAccountSectionsFor,
  parseDriverAccountSection,
  type DriverAccountSectionId,
} from "@/components/driver-hub/driver-account-sections";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import {
  getHubAccountSettings,
  type HubAccountSettings,
} from "@/lib/dashboard/hub/account-settings";

// Session + Prisma access can't be statically rendered, and this page reads
// `searchParams`, which is dynamic in its own right.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account · Driver Hub",
};

/** This page's own URL, for correcting a `?section=` this account cannot have. */
const HUB_ACCOUNT_PATH = "/dashboard/account";

/**
 * The driver-side account settings screen: the design's rail beside the
 * settings this account can actually change.
 *
 * ## Why this lives inside the `(hub)` route group
 *
 * The URL is `/dashboard/account` either way — `(hub)` is a route group and its
 * parentheses are invisible in the path — so the choice is purely about which
 * layout wraps it, and the design decides it. `Driver Header.dc.html` draws the
 * account screen with the hub's header still in place above it: the wordmark,
 * the nav, the bell and the account chip all stay, and only the screen body
 * swaps to the rail-and-panel layout. That is exactly what
 * `(hub)/layout.tsx` → `DriverHubShell` provides, and it is what the two
 * neighbours *outside* the group deliberately reject: `/dashboard/onboarding`
 * and `/dashboard/fleet-onboarding` sit beside `(hub)` because a wizard must
 * not be framed inside the hub it exists to unlock. An account screen has the
 * opposite requirement — it is a place you visit mid-session and leave again,
 * so losing the nav to reach it would be a dead end.
 *
 * Being inside the group also means `resolveHubAccount()` has already run in
 * the layout and the `null` account has already been handled there, so the
 * early return below is narrowing rather than a second fallback.
 *
 * ## The one thing this route still owes the header
 *
 * `/dashboard/account` has no entry in `HUB_NAV`, so `hubNavItemForPath()`
 * returns `undefined` for it and the sticky header falls back to its
 * `FALLBACK_TITLE` ("Driver Hub") with an empty subhead. That is cosmetic and
 * it is deliberately not fixed here: `driver-hub-nav.ts` and
 * `driver-hub-header.tsx` are owned by the parallel header task, which also
 * owns adding the "My account" link that reaches this screen (the header's own
 * comment currently explains that no such link exists *because* there was no
 * driver-side account screen — this page is what retires that note). The rail
 * and the panels below are self-titled, so the screen reads correctly in the
 * meantime.
 *
 * ## Sections are query-string states, not routes
 *
 * See `driver-account-sections.ts`. The upshot here is that the section is
 * resolved server-side, which is what lets the roster-driver rule below be a
 * real boundary rather than a hidden link.
 */
export default async function DriverAccountPage({
  searchParams,
}: {
  // A Promise since Next 15: request-scoped data is awaited in the component
  // that needs it rather than making the whole tree dynamic implicitly.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  const params = await searchParams;
  const section = parseDriverAccountSection(
    params[DRIVER_ACCOUNT_SECTION_PARAM],
    account.persona,
  );

  // `null` means the URL named a section that does not exist, or one withheld
  // from this persona — today only "Payout & bank details" from a ROSTER
  // driver, whose fares are settled to their employer rather than to them.
  // Dropping the row from the rail is cosmetic and does nothing about a
  // hand-typed URL or a bookmark taken before the driver joined a fleet, so the
  // boundary is here. Redirecting rather than quietly rendering the profile
  // panel keeps the URL and the screen agreeing with each other; it is the same
  // shape of guard `(hub)/earnings/page.tsx` and `(hub)/loads/page.tsx` apply
  // to the two whole screens the same persona loses.
  if (section === null) {
    redirect(HUB_ACCOUNT_PATH);
  }

  const settings = await getHubAccountSettings(account);

  // Same `null` as `resolveHubAccount()`'s and for the same cause — an
  // interrupted sign-up. Unreachable in practice: the layout resolved a
  // non-null account from the same row a moment ago.
  if (settings === null) {
    return null;
  }

  const activeSection = driverAccountSection(section);

  return (
    <div className="flex min-w-0 flex-col gap-8 lg:flex-row lg:gap-10">
      <DriverAccountSidebar
        sections={driverAccountSectionsFor(account.persona)}
        activeSection={section}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Settings
            <span aria-hidden="true" className="px-1.5">
              /
            </span>
            <span className="text-foreground">{activeSection.title}</span>
          </p>
          <h1 className="mt-2 text-xl leading-none font-semibold tracking-[-0.01em]">
            {activeSection.title}
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {activeSection.description}
          </p>
        </header>

        <SectionPanel section={section} settings={settings} />
      </div>
    </div>
  );
}

/**
 * The panel behind the selected rail row.
 *
 * A `switch` on the section id rather than a lookup table of components,
 * because the two data-backed panels take different props from each other and
 * from the three placeholders — a table would have to type the union of them
 * and lose the exhaustiveness check the `switch` gets for free.
 */
function SectionPanel({
  section,
  settings,
}: {
  section: DriverAccountSectionId;
  settings: HubAccountSettings;
}) {
  switch (section) {
    case "profile":
      return (
        <>
          {/* A driver may correct their own identity through `POST
              /api/driver-profile`; a fleet's registered details are part of an
              approved application and are corrected through it. Both panels are
              honest about which they are — see each component's own note. */}
          {settings.shape === "DRIVER" ? (
            <DriverAccountProfileForm settings={settings} />
          ) : (
            <DriverAccountCompanyCard settings={settings} />
          )}
          {/* Better Auth's `changePassword` is role-agnostic, so this is the
              one panel on the screen that is identical for all three
              personas. */}
          <DriverAccountPasswordCard />
        </>
      );

    case "payout":
      return <DriverAccountPayoutPanel settings={settings} />;

    case "notifications":
    case "language":
    case "support":
      return <DriverAccountPlaceholderPanel section={section} />;
  }
}
