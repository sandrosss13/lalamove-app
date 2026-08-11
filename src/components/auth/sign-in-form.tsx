"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signIn, signOut, authClient } from "@/lib/auth-client";
import { merchantOrigin, type Audience } from "@/lib/host";

type Role = "CLIENT" | "DRIVER" | "COMPANY";

/** Human-readable label for a role, used in headings and mismatch messaging. */
const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "client",
  DRIVER: "driver",
  COMPANY: "logistics company",
};

/**
 * Subtext under each step-1 card. Keyed by role and shared by every audience:
 * only the card *headline* differs between hosts (see `cardLabel` below), the
 * description of what that portal is for does not.
 */
const CARD_DESCRIPTIONS: Record<Role, string> = {
  CLIENT: "Book deliveries for your packages",
  DRIVER: "Deliver packages and earn",
  COMPANY: "Manage your fleet and dispatch drivers",
};

/** Step-1 card headlines everywhere except the merchant host. */
const CARD_LABELS: Record<Role, string> = {
  CLIENT: "Client",
  DRIVER: "Driver",
  COMPANY: "Company",
};

/**
 * The merchant host spells its two portals out in full, because there the
 * distinction between them *is* the choice being made. Kept separate from
 * `CARD_LABELS` so the split-disabled picker's original wording is untouched.
 */
const MERCHANT_CARD_LABELS: Partial<Record<Role, string>> = {
  DRIVER: "Individual Driver",
  COMPANY: "Logistics Company",
};

/**
 * Where to send a successfully signed-in user. The merchant host must NOT push
 * `"/"` — that path is client-only, so the middleware would immediately bounce
 * the driver or company back to the client host, where their merchant session
 * does not exist and they would land signed out.
 *
 * Keyed by audience only: the destination depends on which host the user is on,
 * not on which of that host's portals they picked.
 */
const POST_SIGN_IN_PATH: Record<Audience, string> = {
  CLIENT: "/",
  MERCHANT: "/dashboard",
  // Unreachable: the admin host serves `/admin/**` only, so middleware
  // redirects `/sign-in` off it before this component can ever render there.
  // The key exists purely because `Audience` includes "ADMIN".
  ADMIN: "/admin",
  BOTH: "/",
};

const CARD_CLASS_NAME = "rounded border p-6 text-left hover:opacity-70";

type PortalCardProps = {
  /** Headline shown on the card. */
  label: string;
  /** One-line explanation of who the portal is for. */
  description: string;
} & (
  { onSelect: () => void; href?: never } | { href: string; onSelect?: never }
);

/**
 * One step-1 portal card. Renders as a `<button>` when picking it just reveals
 * the form on this page, and as an `<a>` when it points at the *other* host —
 * a cross-origin destination has to be a real document navigation, since
 * Next's client router only handles same-origin URLs.
 */
function PortalCard({ label, description, onSelect, href }: PortalCardProps) {
  const content = (
    <>
      <span className="block font-medium">{label}</span>
      <span className="block text-sm opacity-70">{description}</span>
    </>
  );

  if (href !== undefined) {
    return (
      <a href={href} className={CARD_CLASS_NAME}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onSelect} className={CARD_CLASS_NAME}>
      {content}
    </button>
  );
}

type SignInFormProps = {
  /** Audience served by the host this page was requested on. */
  audience: Audience;
};

/**
 * Sign-in form. Every audience uses the same two-step flow — a card picker,
 * then the form for the picked role — and only the *card list* differs:
 *
 * - `"CLIENT"` — Client (stays here) and Driver (a link across to the merchant
 *   host, which owns driver and company sign-in).
 * - `"MERCHANT"` — Individual Driver and Logistics Company. These are separate
 *   cards rather than one merged "merchant" form so each sign-in is checked
 *   against that specific role: a company credential entered under Individual
 *   Driver is rejected, not silently accepted.
 * - `"BOTH"` — the split is disabled, so this keeps the original three-portal
 *   picker (Client / Driver / Company) verbatim.
 *
 * In all three cases the picked role is the only role accepted, so the whole
 * component is role-driven rather than host-driven; the host only decides which
 * cards exist and where success lands.
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
  // Null until the user picks a portal in step 1, at which point picking one
  // reveals the form. Every audience goes through this, including the split
  // hosts — they just offer fewer cards.
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The picked portal is the only role allowed through, on every host.
  const allowedRoles: Role[] = role ? [role] : [];

  /** Message shown when the account's real role isn't the one that was picked. */
  function mismatchMessage(actualRole: Role): string {
    if (audience === "CLIENT" && actualRole !== "CLIENT") {
      const actualRoleLabel = ROLE_LABELS[actualRole];
      return `This account is registered as a ${actualRoleLabel}. Please sign in at the merchant portal.`;
    }

    if (audience === "MERCHANT" && actualRole === "CLIENT") {
      return "This is a customer account. Please sign in at the main site.";
    }

    // On the merchant host, "driver" needs its own sentence: the card reads
    // "Individual Driver" (a vowel-led phrase, so the article is "an"), which
    // doesn't fit the generic "a {label}" template below without special-
    // casing the grammar. Every other audience — including "BOTH" — falls
    // through to that template with its original ROLE_LABELS text unchanged.
    if (audience === "MERCHANT" && actualRole === "DRIVER") {
      return "This account is registered as an individual driver. Please use the individual driver sign-in.";
    }

    // Same-host mismatch: picked the wrong portal (split disabled) or picked
    // "Logistics Company" with a driver account (merchant host).
    const actualRoleLabel = ROLE_LABELS[actualRole];
    return `This account is registered as a ${actualRoleLabel}. Please use the ${actualRoleLabel} sign-in.`;
  }

  /** Step-1 card headline for this host. */
  function cardLabel(cardRole: Role): string {
    if (audience === "MERCHANT") {
      return MERCHANT_CARD_LABELS[cardRole] ?? CARD_LABELS[cardRole];
    }

    return CARD_LABELS[cardRole];
  }

  /**
   * Step-2 heading text. Kept as a small override rather than changing
   * ROLE_LABELS itself, so the "BOTH" (split-disabled) audience's existing
   * "Sign in as a driver" wording is untouched — only the merchant host's
   * "Individual Driver" card gets the fuller phrasing that matches its label.
   */
  function signInHeading(pickedRole: Role): string {
    if (audience === "MERCHANT" && pickedRole === "DRIVER") {
      return "Sign in as an individual driver";
    }

    return `Sign in as a ${ROLE_LABELS[pickedRole]}`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form only renders once a portal is picked, so this is never empty
    // here; the guard narrows the nullable state and is a defensive no-op in
    // practice.
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
    // role and enforce that it matches the portal the user picked — a driver
    // can't sign in through the client portal, and a logistics company can't
    // sign in through the individual-driver one. `getSession` returns the
    // custom `role` field, typed via `inferAdditionalFields` in auth-client.
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

  // Step 1: no portal chosen yet — present this host's portals as large cards.
  if (role === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Sign in</h1>

        <div className="flex flex-col gap-4">
          {/* The merchant host serves drivers and companies only. */}
          {audience !== "MERCHANT" ? (
            <PortalCard
              label={cardLabel("CLIENT")}
              description={CARD_DESCRIPTIONS.CLIENT}
              onSelect={() => setRole("CLIENT")}
            />
          ) : null}

          {audience === "CLIENT" ? (
            // Drivers don't sign in on the client host at all — hand them off
            // to the merchant host's own sign-in page, where their session
            // will actually exist. `merchantOrigin()` cannot be null here (a
            // "CLIENT" audience means the split is enabled), but fall back to
            // a same-host relative path rather than asserting non-null.
            <PortalCard
              label={cardLabel("DRIVER")}
              description={CARD_DESCRIPTIONS.DRIVER}
              href={`${merchantOrigin() ?? ""}/sign-in`}
            />
          ) : (
            <PortalCard
              label={cardLabel("DRIVER")}
              description={CARD_DESCRIPTIONS.DRIVER}
              onSelect={() => setRole("DRIVER")}
            />
          )}

          {audience !== "CLIENT" ? (
            <PortalCard
              label={cardLabel("COMPANY")}
              description={CARD_DESCRIPTIONS.COMPANY}
              onSelect={() => setRole("COMPANY")}
            />
          ) : null}
        </div>
      </main>
    );
  }

  // Step 2: a portal was picked, so `role` is non-null from here on — show the
  // sign-in form for it, with a way back to the picker.
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <button
        type="button"
        onClick={() => setRole(null)}
        className="self-start text-sm hover:opacity-70"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold">{signInHeading(role)}</h1>

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
