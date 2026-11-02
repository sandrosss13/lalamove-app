import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localeHref } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { DATA_SCREEN_WIDTH_CLASSES } from "@/lib/layout";
import { prisma } from "@/lib/prisma";
import { AccountSidebar } from "@/components/account-sidebar";
import { SavedAddressesManager } from "@/components/saved-addresses/saved-addresses-manager";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

const PANEL_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

/**
 * The client's saved addresses — places from past bookings or added by hand,
 * with the contact and access details for each — as a section of My account,
 * beside Profile, Orders and Wallet in the account rail.
 *
 * Addresses are added two ways: from the after-booking prompt on
 * `/checkout/[id]/success`, where the address has just been geocoded and its
 * Contact Info typed, and from this page's "Add address" dialog, which only
 * accepts a picked autocomplete suggestion with coordinates. This page also
 * edits and removes them; the address itself and its coordinates stay
 * read-only in the edit dialog, so a row never drifts from the position the
 * driver is routed to.
 *
 * Unlike the wallet, the list is loaded client-side from
 * `GET /api/saved-addresses` (see `SavedAddressesManager`), so this page and
 * the booking form read addresses through the one endpoint and its one
 * ordering. The server half only guards the route and reads the account type,
 * which decides whether the add and edit dialogs ask for a driver comment.
 */
export default async function AccountSavedAddressesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations("savedAddresses.page");
  const tAccount = await getTranslations("account.account");
  const tShared = await getTranslations("common.shared");

  // Same signed-out screen as the other sections of My account.
  if (!session) {
    return (
      <main className="min-h-screen bg-ink text-paper">
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-5 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.025em]">
            {t("title")}
          </h1>
          <p className="text-sm text-muted">{t("pleaseSignIn")}</p>
          <div className="flex justify-center gap-3">
            <Link
              href="/sign-in"
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              {tShared("signIn")}
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
            >
              {tShared("signUp")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Saved addresses belong to clients: drivers and logistics companies work
  // from /dashboard instead.
  if (session.user.role !== "CLIENT") {
    redirect(await localeHref("/dashboard"));
  }

  // A business has no driver comment (the API stores "" for one), so its edit
  // dialog does not offer the field. Defaults to an individual, as the
  // profile section does for an account without a profile row.
  const clientProfile = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
    select: { accountType: true },
  });

  return (
    // The same shell as the profile and wallet sections: the account rail
    // beside the section, at the data-screen width.
    <main className="min-h-screen bg-ink text-paper">
      <div
        className={`${DATA_SCREEN_WIDTH_CLASSES} flex flex-col gap-8 px-5 py-8 sm:px-8 lg:flex-row lg:gap-12`}
      >
        <AccountSidebar />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header>
            <p className={PANEL_LABEL_CLASSES}>
              {tAccount("settings")}
              <span aria-hidden="true" className="px-1.5">
                /
              </span>
              <span className="text-accent">{t("title")}</span>
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.5rem,3vw,2rem)] leading-none font-semibold tracking-[-0.025em] text-paper">
              {t("title")}
            </h1>
            <p className="mt-2.5 max-w-xl text-[0.8125rem] leading-relaxed text-muted">
              {t("intro")}
            </p>
          </header>

          <div className="max-w-3xl">
            <SavedAddressesManager
              accountType={clientProfile?.accountType ?? "INDIVIDUAL"}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
