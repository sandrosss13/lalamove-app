"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { signOut, useSession } from "@/lib/auth-client";

/**
 * Header widget reflecting the current session. Shows the signed-in user with a
 * sign-out button, or sign-in / sign-up links when there is no session.
 */
export function AuthStatus() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return <span className="text-sm opacity-50">…</span>;
  }

  if (session) {
    const { name, role } = session.user;

    async function handleSignOut() {
      await signOut();
      router.refresh();
    }

    // Clients live on /account; drivers and logistics companies manage their
    // fleet, roster and bookings on /dashboard.
    const isClient = role === "CLIENT";

    return (
      <div className="flex items-center gap-3 text-sm">
        <span>
          Signed in as {name} ({role})
        </span>
        {/*
          A client's own route to the marketing page is the wordmark now (see
          `HeaderBrandLink`), not a link here — this used to duplicate that.
        */}
        <Link
          href={isClient ? "/account" : "/dashboard"}
          className="font-medium hover:opacity-70"
        >
          {isClient ? "My account" : "Dashboard"}
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded border px-2 py-1 font-medium hover:opacity-70"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/sign-in" className="font-medium hover:opacity-70">
        Sign in
      </Link>
      <Link href="/sign-up" className="font-medium hover:opacity-70">
        Sign up
      </Link>
    </div>
  );
}

/**
 * The header wordmark, plus — for a signed-in client only — the client's
 * primary nav (Place order / My orders / Wallet), immediately to its right.
 *
 * The wordmark's destination depends on who's looking at it:
 * - A signed-in CLIENT goes to `/home`, the always-marketing route — `/`
 *   shows their booking form once authenticated, so the wordmark is their only
 *   way back to the marketing page without signing out. This is also why
 *   `AuthStatus` no longer has its own "Home page" link: this is that link now.
 * - A signed-in DRIVER/COMPANY goes to `/dashboard`. A plain `/` would be
 *   wrong for them on the merchant host: `/` is client-only under the
 *   merchant/client host split (see `src/middleware.ts`), so clicking it would
 *   get redirected to the client host, where their merchant-host session
 *   cookie doesn't apply — looking like an unexpected sign-out.
 * - Signed out, `/` already renders the same marketing content `/home` does,
 *   so it keeps that simpler, canonical destination.
 */
export function HeaderBrandLink() {
  const { data: session } = useSession();
  const isMerchantUser =
    session?.user.role === "DRIVER" || session?.user.role === "COMPANY";
  const isClient = session?.user.role === "CLIENT";

  const brandHref = isMerchantUser ? "/dashboard" : isClient ? "/home" : "/";

  return (
    <div className="flex items-center gap-5">
      <Link href={brandHref} className="font-bold">
        Lalamove Clone
      </Link>

      {isClient ? (
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="font-medium hover:opacity-70">
            Place order
          </Link>
          <Link href="/orders" className="font-medium hover:opacity-70">
            My orders
          </Link>
          <Link href="/wallet" className="font-medium hover:opacity-70">
            Wallet
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
