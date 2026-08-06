"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signIn, signOut, authClient } from "@/lib/auth-client";

type Role = "CLIENT" | "DRIVER" | "COMPANY";

/** Human-readable label for a role, used in headings and mismatch messaging. */
const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "client",
  DRIVER: "driver",
  COMPANY: "logistics company",
};

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Null until the user picks a portal in step 1; picking one reveals the form.
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form only renders in step 2, so `role` is always set here; this guard
    // narrows the nullable state and is a defensive no-op in practice.
    if (!role) return;
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      setLoading(false);
      setError(signInError.message ?? "Invalid email or password.");
      return;
    }

    // Sign-in succeeded and a session now exists. Read the account's actual
    // role and enforce that it matches the chosen portal — a driver can't sign
    // in through the client portal and vice versa. `getSession` returns the
    // custom `role` field, typed via `inferAdditionalFields` in auth-client.
    const { data: session } = await authClient.getSession();
    const actualRole = session?.user.role as Role | undefined;

    if (actualRole && actualRole !== role) {
      // Wrong portal: undo the session so the user isn't left signed in, then
      // point them at the correct portal without navigating away.
      await signOut();
      setLoading(false);
      const actualRoleLabel = ROLE_LABELS[actualRole];
      setError(
        `This account is registered as a ${actualRoleLabel}. Please use the ${actualRoleLabel} sign-in.`,
      );
      return;
    }

    setLoading(false);
    router.push("/");
    router.refresh();
  }

  // Step 1: no portal chosen yet — present the portals as large cards.
  if (role === null) {
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

  // Step 2: a portal is chosen — show the sign-in form.
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <button
        type="button"
        onClick={() => setRole(null)}
        className="self-start text-sm hover:opacity-70"
      >
        ← Back
      </button>

      {/* Derived from ROLE_LABELS so adding a portal only needs a label entry. */}
      <h1 className="text-2xl font-bold">Sign in as a {ROLE_LABELS[role]}</h1>

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
