import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localeHref } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { DATA_SCREEN_WIDTH_CLASSES } from "@/lib/layout";
import { prisma } from "@/lib/prisma";
import { AccountSidebar } from "@/components/account-sidebar";
import { SavedCardsPanel } from "@/components/wallet/saved-cards-panel";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

const PANEL_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

/**
 * The client's wallet — saved cards, and the actions on them — as a section of
 * My account, beside Profile in the account rail.
 *
 * It used to be its own top-level page at `/wallet`, linked from the global
 * header's client nav. It moved here so the header carries only the two things
 * a client does most (place an order, see their orders) and everything about
 * the account itself sits behind My account. `/wallet` still exists and
 * redirects here, so old links and bookmarks keep working.
 *
 * **No payment gateway exists and none has been chosen**, which is what the
 * banner under the header says outright: a card saved here is display metadata
 * (brand, last four, expiry, holder name) and nothing is ever charged against
 * it. The card number and security code are entered in the browser, used there
 * to derive the brand and the last four, and discarded — see
 * `add-card-dialog.tsx`, and the tripwire on `POST /api/saved-cards` that
 * refuses any body carrying a PAN- or CVC-shaped field.
 *
 * Deliberately *not* here: transaction history and invoices, both of which the
 * design handoff draws. Neither has a backing table — no `Payment` row is
 * created anywhere in this codebase — and there is no PDF pipeline behind a
 * "Download PDF" link. Illustrative rows would be fabricated financial records,
 * and a link that 404s is worse than an absent section, so the sections wait
 * for the data rather than being filled in.
 *
 * This page stays a server component and owns the list; `SavedCardsPanel`
 * mutates and calls `router.refresh()`, which re-runs this query.
 */
export default async function AccountWalletPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations("wallet.wallet");
  const tAccount = await getTranslations("account.account");
  const tShared = await getTranslations("common.shared");

  // Same signed-out screen as the profile section of My account.
  if (!session) {
    return (
      <main className="min-h-screen bg-ink text-paper">
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-5 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.025em]">
            {tShared("wallet")}
          </h1>
          <p className="text-sm text-muted">{t("pleaseSignInToViewYour")}</p>
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

  // The wallet is a client-only concept: drivers and logistics companies are
  // paid out through the driver hub on /dashboard instead.
  if (session.user.role !== "CLIENT") {
    redirect(await localeHref("/dashboard"));
  }

  // Default first, then newest first — the same order `GET /api/saved-cards`
  // returns, so the list does not reshuffle depending on which of the two read
  // paths produced it. `providerToken` is never selected: it is the gateway's
  // own handle for a card and nothing on the client needs it.
  const cards = await prisma.savedCard.findMany({
    where: { clientId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      brand: true,
      last4: true,
      expMonth: true,
      expYear: true,
      holderName: true,
      isDefault: true,
    },
  });

  return (
    // The same shell as the profile section (`../page.tsx`): the account rail
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
              <span className="text-accent">{tShared("wallet")}</span>
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.5rem,3vw,2rem)] leading-none font-semibold tracking-[-0.025em] text-paper">
              {t("paymentMethods")}
            </h1>
          </header>

          {/* Required, and deliberately impossible to miss: a client is about
              to save card details to a product with no gateway behind it, and
              is owed a plain statement of what that does and does not mean.
              The wording mirrors what the admin finance surface already tells
              staff about the CARD method, so both sides of the app say the
              same thing. */}
          <p className="max-w-3xl rounded-lg border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
            {t("gatewayIntegrationIsPendingCardsSaved")}
          </p>

          <div className="max-w-3xl">
            <SavedCardsPanel cards={cards} />
          </div>
        </div>
      </div>
    </main>
  );
}
