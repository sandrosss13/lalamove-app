"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-types";
import { signIn, signOut, authClient } from "@/lib/auth-client";
import { merchantOrigin, type Audience } from "@/lib/host";

/**
 * Every portal this form can resolve to. COMPANY is not its own step-1 card —
 * it is what the Driver card plus the Business account type resolves to,
 * mirroring the sign-up wizard step for step so that what a user picked when
 * registering is exactly what they pick when returning.
 */
type Role = "CLIENT" | "DRIVER" | "COMPANY";

/** The subset of `Role` that step 1 offers as a card. */
type CardRole = "CLIENT" | "DRIVER";

/** Every value the schema's `UserRole` can hold. ADMIN has no portal here. */
type SessionRole = Role | "ADMIN";

/** Human-readable label for a resolvable portal, used in headings and messaging. */
const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "client",
  DRIVER: "driver",
  COMPANY: "logistics company",
};

/**
 * Subtext under each step-1 card. Keyed by card and shared by every audience:
 * only the card *headline* differs between hosts (see `cardLabel` below), the
 * description of what that portal is for does not.
 */
const CARD_DESCRIPTIONS: Record<CardRole, string> = {
  CLIENT: "Book deliveries for your packages",
  DRIVER: "Deliver packages and earn",
};

/** Step-1 card headlines everywhere except the merchant host. */
const CARD_LABELS: Record<CardRole, string> = {
  CLIENT: "Client",
  DRIVER: "Driver",
};

/**
 * The merchant host spells its driver portal out in full. Kept separate from
 * `CARD_LABELS` so the split-disabled picker's original wording is untouched.
 */
const MERCHANT_CARD_LABELS: Partial<Record<CardRole, string>> = {
  DRIVER: "Individual Driver",
};

/**
 * Where to send a successfully signed-in user. The merchant host must NOT push
 * `"/"` — that path is client-only, so the middleware would immediately bounce
 * the driver back to the client host, where their merchant session does not
 * exist and they would land signed out.
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

/** True when `value` is one of the known account types. */
function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && value in ACCOUNT_TYPE_LABELS;
}

/**
 * Reads the account type stored on the signed-in account's own profile, or
 * `null` when it cannot be determined.
 *
 * `null` covers every unverifiable case — the request failed, the profile row
 * doesn't exist yet (a registration interrupted between account creation and
 * the profile write), or the body isn't shaped as expected — and callers must
 * treat it as "don't block". This lookup is a secondary safety net on top of
 * the role check, so an incomplete profile has to fail open rather than lock a
 * legitimate account out of a portal it belongs to.
 *
 * Only the two card roles have a profile endpoint to ask. A `LogisticsCompany`
 * has no account-type column, so a company session is never passed here — the
 * parameter type says so, and the caller skips the check outright.
 */
async function fetchStoredAccountType(
  sessionRole: CardRole,
): Promise<AccountType | null> {
  const endpoint =
    sessionRole === "CLIENT" ? "/api/client-profile" : "/api/driver-profile";

  // Both endpoints answer for the *signed-in* user only, so the session cookie
  // (sent by default on same-origin requests) is the whole input.
  const response = await fetch(endpoint).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  // The route returns the profile row, or a bare `null` when there is none.
  const profile = (await response.json().catch(() => null)) as {
    accountType?: unknown;
  } | null;

  return isAccountType(profile?.accountType) ? profile.accountType : null;
}

type PortalCardProps = {
  /** Headline shown on the card. */
  label: string;
  /** One-line explanation of who the portal is for. */
  description: string;
} & (
  { onSelect: () => void; href?: never } | { href: string; onSelect?: never }
);

/**
 * One step-1 portal card. Renders as a `<button>` when picking it just advances
 * the wizard on this page, and as an `<a>` when it points at the *other* host —
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
 * Sign-in form. Every audience uses the same three-step flow — a portal picker,
 * then an account-type picker, then the credentials form — mirroring the
 * sign-up wizard step for step, so that what a user picked when registering is
 * exactly what they pick when returning. Only the *card list* in step 1 differs:
 *
 * - `"CLIENT"` — Client (stays here) and Driver (a link across to the merchant
 *   host, which owns driver sign-in).
 * - `"MERCHANT"` — Individual Driver only.
 * - `"BOTH"` — the split is disabled, so this offers both cards on one host.
 *
 * A logistics company signs in through the Driver card plus the Business
 * account type, exactly as it registered: that pair resolves to the COMPANY
 * portal rather than to a driver one, which is why there is no third card.
 *
 * In all three cases the *resolved* portal is the only role accepted, so the
 * whole component is role-driven rather than host-driven; the host only decides
 * which cards exist and where success lands.
 *
 * Both checks necessarily run *after* `signIn.email` succeeds: checking
 * beforehand would require an email → role lookup, which is an account
 * enumeration oracle. A rejected account is signed straight back out, and
 * `src/lib/auth.ts` enforces the same boundary server-side as a backstop.
 */
export function SignInForm({ audience }: SignInFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Null until the user picks a portal in step 1; picking one reveals step 2.
  // Every audience goes through this, including the split hosts — they just
  // offer fewer cards.
  const [role, setRole] = useState<CardRole | null>(null);
  // Null until the user picks an account type in step 2; picking one reveals
  // the credentials form in step 3.
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The portal the two picks resolve to: the Driver card with the Business
  // account type is a logistics company, mirroring sign-up.
  const resolvedRole: Role | null =
    role === null
      ? null
      : role === "DRIVER" && accountType === "BUSINESS"
        ? "COMPANY"
        : role;

  // The resolved portal is the only role allowed through, on every host. Typed
  // as `SessionRole[]` so it can be compared against the account's actual role,
  // which ranges wider than the portals this form can resolve to.
  const allowedRoles: SessionRole[] = resolvedRole ? [resolvedRole] : [];

  /** Message shown when the account's real role isn't the one that was picked. */
  function mismatchMessage(actualRole: SessionRole): string {
    // ADMIN has no card on this form and no portal to point at — the back office
    // is served from its own host, which middleware redirects `/sign-in` off.
    if (actualRole === "ADMIN") {
      return "This account cannot sign in here. Please contact support.";
    }

    if (audience === "CLIENT" && actualRole !== "CLIENT") {
      const actualRoleLabel = ROLE_LABELS[actualRole];
      return `This account is registered as a ${actualRoleLabel}. Please sign in at the merchant portal.`;
    }

    if (audience === "MERCHANT" && actualRole === "CLIENT") {
      return "This is a customer account. Please sign in at the main site.";
    }

    // Same-host mismatch: picked the wrong portal on a host that serves it.
    // The merchant host reaches this line too, now that the Driver card leads
    // to two portals — a company that picked Individual is told to use the
    // logistics company sign-in, and a driver that picked Business is told to
    // use the driver one.
    const actualRoleLabel = ROLE_LABELS[actualRole];
    return `This account is registered as a ${actualRoleLabel}. Please use the ${actualRoleLabel} sign-in.`;
  }

  /** Step-1 card headline for this host. */
  function cardLabel(cardRole: CardRole): string {
    if (audience === "MERCHANT") {
      return MERCHANT_CARD_LABELS[cardRole] ?? CARD_LABELS[cardRole];
    }

    return CARD_LABELS[cardRole];
  }

  /**
   * Heading text for steps 2 and 3. Kept as a small override rather than
   * changing ROLE_LABELS itself, so the "BOTH" (split-disabled) audience's
   * existing "Sign in as a driver" wording is untouched — only the merchant
   * host's "Individual Driver" card gets the fuller phrasing that matches its
   * label.
   *
   * The company branch is checked first, and on every audience: once Business
   * is picked the portal is a logistics company, not an individual driver. In
   * step 2 no account type has been chosen yet, so that step keeps its existing
   * wording.
   */
  function signInHeading(pickedRole: CardRole): string {
    if (pickedRole === "DRIVER" && accountType === "BUSINESS") {
      return "Sign in as a logistics company";
    }

    if (audience === "MERCHANT" && pickedRole === "DRIVER") {
      return "Sign in as an individual driver";
    }

    return `Sign in as a ${ROLE_LABELS[pickedRole]}`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form only renders in step 3, which is reached by way of steps 1 and
    // 2, so both `role` and `accountType` are always set here. These guards
    // narrow the nullable state and are a defensive no-op in practice.
    if (!role) return;
    if (!accountType) return;
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      setLoading(false);
      setError(signInError.message ?? "Invalid email or password.");
      return;
    }

    // Sign-in succeeded and a session now exists. Read the account's actual
    // role and enforce that it matches the portal the two picks resolved to — a
    // driver can't sign in through the client portal, a company can't sign in
    // through the individual-driver one, and an admin account can't sign in here
    // at all. `getSession` returns the custom `role` field, typed via
    // `inferAdditionalFields` in auth-client.
    const { data: session } = await authClient.getSession();
    const actualRole = session?.user.role as SessionRole | undefined;

    if (actualRole && !allowedRoles.includes(actualRole)) {
      // Wrong portal: undo the session so the user isn't left signed in, then
      // point them at the correct one without navigating away.
      await signOut();
      setLoading(false);
      setError(mismatchMessage(actualRole));
      return;
    }

    // The role check passed, so the account's role is the resolved one. For a
    // client or driver its profile endpoint is the authority on which account
    // type was chosen at registration; compare that against the step-2 pick so
    // a business account can't be signed into through the Individual card.
    //
    // A company is skipped entirely: `LogisticsCompany` has no account-type
    // column, so there is nothing to compare against and the role check above
    // is the whole gate. Asking `/api/driver-profile` on its behalf is a
    // request that could only ever 403.
    //
    // `fetchStoredAccountType` returns null whenever the stored value is
    // unknowable, and null must not block: this is a secondary net on top of
    // the role check above, not the primary gate, so an interrupted
    // registration is never a reason to lock someone out of their own account.
    // The skipped company case takes the same null path for the same reason.
    const storedAccountType =
      resolvedRole === "COMPANY" ? null : await fetchStoredAccountType(role);

    if (storedAccountType !== null && storedAccountType !== accountType) {
      // Same treatment as a role mismatch: sign back out rather than leaving a
      // half-accepted session behind, and stay on the form.
      await signOut();
      setLoading(false);
      const storedLabel = ACCOUNT_TYPE_LABELS[storedAccountType];
      setError(
        `This account is registered as ${storedLabel}. Please use the ${storedLabel} sign-in.`,
      );
      return;
    }

    setLoading(false);
    // A company lands on `/dashboard` whatever the host, for the same reason as
    // sign-up: `/` is the client landing page and a company has nothing there.
    // Where it goes from `/dashboard` — the onboarding wizard, the application
    // status screen or the ops dashboard — is decided there, from the
    // application row this form has not read, so nothing further is pushed here.
    router.push(
      resolvedRole === "COMPANY" ? "/dashboard" : POST_SIGN_IN_PATH[audience],
    );
    router.refresh();
  }

  // Step 1: no portal chosen yet — present this host's portals as large cards.
  if (role === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Sign in</h1>

        <div className="flex flex-col gap-4">
          {/* The merchant host serves drivers only. */}
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
        </div>
      </main>
    );
  }

  // Step 2: a portal is picked but no account type yet — present the account
  // types as large cards in the same style as step 1, and in the same split as
  // sign-up: clients see two options, drivers see three (adding Individual
  // Entrepreneur). Going back from here clears the portal, returning to step 1.
  if (accountType === null) {
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

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setAccountType("INDIVIDUAL")}
            className={CARD_CLASS_NAME}
          >
            <span className="block font-medium">Individual</span>
            <span className="block text-sm opacity-70">
              Sign in as a private individual
            </span>
          </button>

          {role === "DRIVER" ? (
            <button
              type="button"
              onClick={() => setAccountType("INDIVIDUAL_ENTREPRENEUR")}
              className={CARD_CLASS_NAME}
            >
              <span className="block font-medium">Individual Entrepreneur</span>
              <span className="block text-sm opacity-70">
                Registered as an individual entrepreneur (ინდ. მეწარმე)
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setAccountType("BUSINESS")}
            className={CARD_CLASS_NAME}
          >
            <span className="block font-medium">Business</span>
            <span className="block text-sm opacity-70">
              Sign in as a registered company
            </span>
          </button>
        </div>
      </main>
    );
  }

  // Step 3: both portal and account type are picked — show the credentials
  // form. Back here clears only the account type, dropping to step 2 rather
  // than all the way out to the portal picker.
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <button
        type="button"
        onClick={() => setAccountType(null)}
        className="self-start text-sm hover:opacity-70"
      >
        ← Back
      </button>

      {/* The company branch's heading already names the account type, so the
          suffix would only add "— Business" noise to it. */}
      <h1 className="text-2xl font-bold">
        {signInHeading(role)}
        {role === "DRIVER" && accountType === "BUSINESS"
          ? null
          : ` — ${ACCOUNT_TYPE_LABELS[accountType]}`}
      </h1>

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
