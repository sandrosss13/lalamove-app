import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

// Session access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Placeholder for the client wallet — linked from the header nav, but there is
 * no wallet feature yet: no balance, no top-up, no transaction history, and no
 * backend to hold any of it. This exists so the nav link lands somewhere
 * honest instead of a 404 or a fabricated balance; replace it once the wallet
 * feature itself is built.
 */
export default async function WalletPage() {
  const session = await auth.api.getSession({ headers: await headers() });

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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Wallet</h1>
      <p className="opacity-70">
        Wallet balance, top-ups and transaction history aren&rsquo;t built
        yet. For now, orders are paid the way they already are today.
      </p>
      <Link href="/" className="font-medium hover:opacity-70">
        ← Back to booking
      </Link>
    </main>
  );
}
