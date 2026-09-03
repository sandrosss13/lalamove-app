import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SavedCardsPanel } from "@/components/wallet/saved-cards-panel";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The client's payment methods — saved cards, and the actions on them.
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
export default async function WalletPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  // Access control is unchanged from the placeholder this page replaces: the
  // signed-out branch and the CLIENT-only redirect below behave exactly as they
  // did, and only the signed-in content is new.
  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Wallet</h1>
        <p className="opacity-70">Please sign in to view your wallet.</p>
        <div className="flex justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign up
          </Link>
        </div>
      </main>
    );
  }

  // The wallet is a client-only concept — see the header nav in
  // `auth-status.tsx`, which only shows this link to a signed-in CLIENT.
  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
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
    // The page background is painted on `main` rather than on the centred
    // column so it covers the full viewport: `body` still resolves
    // `--background`, which is near-black under a dark system preference, and a
    // column-width background would leave that showing down both gutters. Same
    // shell as the order list this page sits beside.
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-8 pt-8 pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-accent uppercase">
              Wallet
            </p>
            <h1 className="font-display mt-2 text-[2.5rem] leading-none font-semibold tracking-[-0.025em] text-paper">
              Payment methods
            </h1>
          </div>
          <Link
            href="/"
            className="text-[14px] font-semibold text-paper transition-colors hover:text-accent"
          >
            ← New order
          </Link>
        </header>

        {/* Required, and deliberately impossible to miss: a client is about to
            save card details to a product with no gateway behind it, and is
            owed a plain statement of what that does and does not mean. The
            wording mirrors what the admin finance surface already tells staff
            about the CARD method, so both sides of the app say the same thing.  */}
        <p className="rounded-lg border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
          Gateway integration is pending. Cards saved here are not charged, and
          only the brand and last four digits are stored.
        </p>

        <SavedCardsPanel cards={cards} />
      </div>
    </main>
  );
}
