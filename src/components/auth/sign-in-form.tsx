"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signIn, signOut, authClient } from "@/lib/auth-client";
import type { Audience } from "@/lib/host";

type Role = "CLIENT" | "DRIVER" | "COMPANY";

/** Human-readable label for a role, used in headings and mismatch messaging. */
const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "client",
  DRIVER: "driver",
  COMPANY: "logistics company",
};

/**
 * Which roles each host's audience may sign in as. `"BOTH"` (the split
 * disabled) is absent on purpose: there the allowed role is whichever portal
 * the user picked in step 1, so it can only be derived at render time.
 */
const ALLOWED_ROLES: Record<Exclude<Audience, "BOTH">, Role[]> = {
  CLIENT: ["CLIENT"],
  MERCHANT: ["DRIVER", "COMPANY"],
};

/**
 * Where to send a successfully signed-in user. The merchant host must NOT push
 * `"/"` — that path is client-only, so the middleware would immediately bounce
 * the driver or company back to the client host, where their merchant session
 * does not exist and they would land signed out.
 */
const POST_SIGN_IN_PATH: Record<Audience, string> = {
  CLIENT: "/",
  MERCHANT: "/dashboard",
  BOTH: "/",
};

type SignInFormProps = {
  /** Audience served by the host this page was requested on. */
  audience: Audience;
};

/**
 * Sign-in form, scoped to the requesting host's audience.
 *
 * - `"CLIENT"` — only a CLIENT credential is accepted; the portal picker is
 *   skipped since there is only one portal on this host.
 * - `"MERCHANT"` — only a DRIVER or COMPANY credential is accepted; the picker
 *   is likewise skipped and success lands on the ops dashboard.
 * - `"BOTH"` — the split is disabled, so this keeps the original two-step
 *   portal-picker flow verbatim, matching the session's role against the
 *   picked portal.
 *
 * The role check necessarily runs *after* `signIn.email` succeeds: checking
 * beforehand would require an email → role lookup, which is an account
 * enumeration oracle. A rejected account is signed straight back out, and
 * `src/lib/auth.ts` enforces the same boundary server-side as a backstop.
 */
export function SignInForm({ audience }: SignInFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Only used when the split is disabled: null until the user picks a portal in
  // step 1, at which point picking one reveals the form. On a client or
  // merchant host the host itself determines the portal, so this stays null.
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // On a split host the allowed roles come from the host; with the split
  // disabled they come from the portal the user picked.
  const allowedRoles: Role[] =
    audience === "BOTH" ? (role ? [role] : []) : ALLOWED_ROLES[audience];

  /** Message shown when the account's real role isn't allowed on this host. */
  function mismatchMessage(actualRole: Role): string {
    if (audience === "MERCHANT") {
      return "This is a customer account. Please sign in at the main site.";
    }

    const actualRoleLabel = ROLE_LABELS[actualRole];

    if (audience === "CLIENT") {
      return `This account is registered as a ${actualRoleLabel}. Please sign in at the merchant portal.`;
    }

    return `This account is registered as a ${actualRoleLabel}. Please use the ${actualRoleLabel} sign-in.`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // With the split disabled the form only renders once a portal is picked, so
    // this is never empty here; the guard narrows the nullable state and is a
    // defensive no-op in practice.
    if (allowedRoles.length === 0) return;
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      setLoading(false);
      setError(signInError.message ?? "Invalid email or password.");
      return;
    }

    // Sign-in succeeded and a session now exists. Read the account's actual
    // role and enforce that it's one this host (or, with the split disabled,
    // the chosen portal) accepts — a driver can't sign in through the client
    // portal and vice versa. `getSession` returns the custom `role` field,
    // typed via `inferAdditionalFields` in auth-client.
    const { data: session } = await authClient.getSession();
    const actualRole = session?.user.role as Role | undefined;

    if (actualRole && !allowedRoles.includes(actualRole)) {
      // Wrong portal: undo the session so the user isn't left signed in, then
      // point them at the correct one without navigating away.
      await signOut();
      setLoading(false);
      setError(mismatchMessage(actualRole));
      return;
    }

    setLoading(false);
    router.push(POST_SIGN_IN_PATH[audience]);
    router.refresh();
  }

  // Step 1, split disabled only: no portal chosen yet — present the portals as
  // large cards. A client or merchant host has a single portal and skips this.
  if (audience === "BOTH" && role === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Sign in</h1>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setRole("CLIENT")}
            className="rounded border p-6 text-left hover:opacity-70"
          >
            <span className="block font-medium">Client</span>
            <span className="block text-sm opacity-70">
              Book deliveries for your packages
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRole("DRIVER")}
            className="rounded border p-6 text-left hover:opacity-70"
          >
            <span className="block font-medium">Driver</span>
            <span className="block text-sm opacity-70">
              Deliver packages and earn
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRole("COMPANY")}
            className="rounded border p-6 text-left hover:opacity-70"
          >
            <span className="block font-medium">Company</span>
            <span className="block text-sm opacity-70">
              Manage your fleet and dispatch drivers
            </span>
          </button>
        </div>
      </main>
    );
  }

  // Step 2 (or the only step on a split host): show the sign-in form.
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      {audience === "BOTH" && role ? (
        <>
          <button
            type="button"
            onClick={() => setRole(null)}
            className="self-start text-sm hover:opacity-70"
          >
            ← Back
          </button>

          {/* Derived from ROLE_LABELS so adding a portal only needs a label entry. */}
          <h1 className="text-2xl font-bold">
            Sign in as a {ROLE_LABELS[role]}
          </h1>
        </>
      ) : (
        // A split host serves one portal, so there is nothing to go back to and
        // nothing to disambiguate in the heading.
        <h1 className="text-2xl font-bold">Sign in</h1>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded border px-3 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
