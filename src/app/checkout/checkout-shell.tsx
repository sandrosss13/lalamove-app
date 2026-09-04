import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The two states both checkout pages render identically — signed out, and
 * "there is no such order of yours" — plus the header they share when there is
 * something to show.
 *
 * Server components with no interactivity, so they carry no `"use client"` and
 * stay out of the browser bundle.
 *
 * Sharing these is not tidiness. The not-found notice is a *security* surface:
 * `/checkout/[id]` and `/checkout/[id]/success` must both answer somebody else's
 * order exactly as they answer a nonexistent one, or the pair becomes a way to
 * probe which order ids exist (the reasoning `src/app/orders/[id]/track/page.tsx`
 * records for its own branch). One component is one wording, and one wording
 * cannot drift out of agreement with itself.
 *
 * Colour rule: landing token utilities only (`bg-ink`, `bg-surface`,
 * `text-paper`, `text-muted`, `border-line`, the accent) — never a hex literal
 * and never a `dark:` variant, which cannot match here because these pages carry
 * no `data-landing-page` (see `globals.css`'s `@custom-variant dark`).
 */

/**
 * A centred card on the full-page ground, for the states where there is nothing
 * to check out.
 *
 * The background is painted on `main` rather than on the column so it covers the
 * viewport: `body` still resolves `--background`, which is near-black under a
 * dark system preference, and a column-width background would leave that showing
 * down both gutters. Same shell as the signed-in pages beside it, so both states
 * read as one page rather than two.
 */
export function CheckoutNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-8 py-16">
        <div className="rounded-[14px] border border-line bg-surface p-8 text-center">
          <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.025em] text-paper">
            {title}
          </h1>
          {children}
        </div>
      </div>
    </main>
  );
}

/**
 * The signed-out state. Copied from the landing-token panel on
 * `src/app/orders/page.tsx` rather than the older untokenized one the wallet and
 * tracking pages still carry, so a client bounced here from a stale link lands
 * on the same chrome the rest of their order surfaces use.
 *
 * `prompt` names what signing in will let them finish, because the two checkout
 * pages are different halves of one errand: one is a delivery still to be paid
 * for, the other a confirmation to read.
 */
export function CheckoutSignInNotice({ prompt }: { prompt: string }) {
  return (
    <CheckoutNotice title="Checkout">
      <p className="mt-3 text-[14px] text-muted">{prompt}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/sign-in"
          className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
        >
          Sign up
        </Link>
      </div>
    </CheckoutNotice>
  );
}

/**
 * What a missing order and somebody else's order both look like — one component
 * precisely so the two cannot be told apart. Never give this branch a different
 * wording, a different status or a different link depending on which of the two
 * it is.
 */
export function CheckoutOrderNotFoundNotice() {
  return (
    <CheckoutNotice title="Order not found.">
      <p className="mt-3 text-[14px] text-muted">
        We couldn&rsquo;t find that delivery under your account.
      </p>
      <div className="mt-6 flex justify-center">
        <Link
          href="/orders"
          className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
        >
          Back to your orders
        </Link>
      </div>
    </CheckoutNotice>
  );
}

/**
 * The header both signed-in checkout pages wear: an eyebrow, a display-face
 * title and a back link, laid out as `src/app/wallet/page.tsx` and
 * `src/app/orders/page.tsx` lay theirs out.
 */
export function CheckoutHeader({
  eyebrow,
  title,
  backHref,
  backLabel,
}: {
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.24em] text-accent uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display mt-2 text-[2.5rem] leading-none font-semibold tracking-[-0.025em] text-paper">
          {title}
        </h1>
      </div>
      <Link
        href={backHref}
        className="text-[14px] font-semibold text-paper transition-colors hover:text-accent"
      >
        {backLabel}
      </Link>
    </header>
  );
}
