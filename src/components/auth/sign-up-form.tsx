"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signUp } from "@/lib/auth-client";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { merchantOrigin, type Audience } from "@/lib/host";

type Role = "CLIENT" | "DRIVER";
// Covers every account type across clients and drivers. Clients only ever set
// INDIVIDUAL or BUSINESS; drivers can additionally be an
// INDIVIDUAL_ENTREPRENEUR.
type AccountType = "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "BUSINESS";

/** Human-readable label for an account type, used in the step 3 heading. */
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  INDIVIDUAL: "Individual",
  INDIVIDUAL_ENTREPRENEUR: "Individual Entrepreneur",
  BUSINESS: "Business",
};

/** Heading shown once a role has been chosen, in steps 2 and 3. */
const ROLE_HEADINGS: Record<Role, string> = {
  CLIENT: "Sign up as a client",
  DRIVER: "Sign up as a driver",
};

/**
 * Heading text for steps 2 and 3. Kept as a small override rather than
 * changing ROLE_HEADINGS itself, so the "BOTH" (split-disabled) audience's
 * existing "Sign up as a driver" wording is untouched — only the merchant
 * host's "Individual Driver" card gets the fuller phrasing that matches its
 * label.
 */
function roleHeading(pickedRole: Role, currentAudience: Audience): string {
  if (currentAudience === "MERCHANT" && pickedRole === "DRIVER") {
    return "Sign up as an individual driver";
  }

  return ROLE_HEADINGS[pickedRole];
}

/**
 * The registration wizard, scoped to the audience of the host it is served
 * from (see `src/lib/host.ts`). The wizard itself — the fields, the follow-up
 * profile writes, the markup — is identical for every audience; only which
 * roles step 1 offers and the post-success destination differ:
 *
 * - `"BOTH"` (split disabled): the full two-role wizard, offering both CLIENT
 *   and DRIVER.
 * - `"CLIENT"`: step 1 offers two cards — Client, which continues the wizard
 *   here, and Driver, which is a cross-origin link to the merchant host's own
 *   sign-up page rather than a role this host can create.
 * - `"MERCHANT"`: only the DRIVER role (labelled "Individual Driver" here) is
 *   offered, and a newly created account lands on `/dashboard` rather than `/`,
 *   which is a client-host path the merchant host would immediately bounce it
 *   off.
 */
export function SignUpForm({ audience }: { audience: Audience }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Null until the user picks a role in step 1; picking one reveals step 2.
  // Every audience starts here, including the client host — its step 1 offers
  // Client (which continues here) alongside a link out to the merchant host.
  const [role, setRole] = useState<Role | null>(null);
  // Null until the user picks an account type in step 2; picking one reveals
  // the form in step 3.
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [city, setCity] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [vatId, setVatId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form only renders in step 3, which every role reaches by way of
    // steps 1 and 2, so both `role` and `accountType` are always set here.
    // These guards narrow the nullable state and are a defensive no-op in
    // practice.
    if (!role) return;
    if (!accountType) return;
    setError(null);
    setLoading(true);

    // Better Auth requires a `name`, but the form never shows a bare name
    // field — the identity fields are now identical across roles, so we derive
    // the name uniformly: the company name for a business account, the full
    // name otherwise.
    const resolvedName =
      accountType === "BUSINESS"
        ? companyName
        : `${firstName} ${lastName}`.trim();

    const { error: signUpError } = await signUp.email({
      name: resolvedName,
      email,
      password,
      role,
    });

    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message ?? "Something went wrong. Please try again.",
      );
      return;
    }

    // Better Auth has created the account and a session by this point. Drivers
    // must additionally create a DriverProfile with their identity details and
    // city. If that step fails we surface the error and stay put —
    // the account exists, so we don't navigate away as if everything succeeded.
    // Only the fields relevant to the chosen account type are sent.
    if (role === "DRIVER") {
      const response = await fetch("/api/driver-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          accountType === "BUSINESS"
            ? { accountType, companyName, vatId, phone, city }
            : { accountType, firstName, lastName, phone, city },
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          payload?.error ??
            "Could not save your driver details. Please try again.",
        );
        setLoading(false);
        return;
      }
    }

    // Clients likewise get a follow-up ClientProfile with their account-type
    // details. Same failure handling as drivers: the account already exists,
    // so we surface the error and stay put rather than navigating away. Only
    // the fields relevant to the chosen account type are sent.
    if (role === "CLIENT") {
      const response = await fetch("/api/client-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          accountType === "BUSINESS"
            ? { accountType, companyName, vatId, phone }
            : { accountType, firstName, lastName, phone },
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          payload?.error ??
            "Could not save your account details. Please try again.",
        );
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    // The merchant host doesn't serve `/` — sending a freshly created driver
    // account there would bounce it straight back off the host it just signed
    // up on. Every other audience owns `/`.
    router.push(audience === "MERCHANT" ? "/dashboard" : "/");
    router.refresh();
  }

  // Step 1: no role chosen yet — present the portals as large cards. Which
  // cards appear depends on the audience: `"BOTH"` sees both roles, the client
  // host sees Client + a link out to the merchant host's driver sign-up, and
  // the merchant host sees only Driver, the one role it can actually create.
  if (role === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Create an account</h1>

        <div className="flex flex-col gap-4">
          {/* The merchant host only ever creates DRIVER accounts. */}
          {audience === "MERCHANT" ? null : (
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
          )}

          {/* Drivers belong to the merchant host, so on the client host this
              card is a real cross-origin navigation rather than a role this
              host can create. `merchantOrigin()` is only null while the split
              is disabled — an audience of "CLIENT" means it is on — so the
              empty-string fallback (which degrades to a same-host "/sign-up")
              is purely defensive. */}
          {audience === "CLIENT" ? (
            <a
              href={`${merchantOrigin() ?? ""}/sign-up`}
              className="rounded border p-6 text-left hover:opacity-70"
            >
              <span className="block font-medium">Driver</span>
              <span className="block text-sm opacity-70">
                Deliver packages and earn
              </span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setRole("DRIVER")}
              className="rounded border p-6 text-left hover:opacity-70"
            >
              <span className="block font-medium">
                {/* The merchant host keeps the fuller label its sign-up
                    headings are written around (see `roleHeading`). */}
                {audience === "MERCHANT" ? "Individual Driver" : "Driver"}
              </span>
              <span className="block text-sm opacity-70">
                Deliver packages and earn
              </span>
            </button>
          )}
        </div>
      </main>
    );
  }

  // Step 2: a role is chosen but no account type yet — present the account
  // types as large cards in the same style as step 1. Clients see two options;
  // drivers see three (adding Individual Entrepreneur).
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

        <h1 className="text-2xl font-bold">{roleHeading(role, audience)}</h1>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setAccountType("INDIVIDUAL")}
            className="rounded border p-6 text-left hover:opacity-70"
          >
            <span className="block font-medium">Individual</span>
            <span className="block text-sm opacity-70">
              Sign up as a private individual
            </span>
          </button>

          {role === "DRIVER" ? (
            <button
              type="button"
              onClick={() => setAccountType("INDIVIDUAL_ENTREPRENEUR")}
              className="rounded border p-6 text-left hover:opacity-70"
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
            className="rounded border p-6 text-left hover:opacity-70"
          >
            <span className="block font-medium">Business</span>
            <span className="block text-sm opacity-70">
              Sign up as a registered company
            </span>
          </button>
        </div>
      </main>
    );
  }

  // Step 3: both role and account type are chosen — show the identity form.
  // The field shapes are identical across roles; drivers additionally get a
  // city select.
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <button
        type="button"
        onClick={() => setAccountType(null)}
        className="self-start text-sm hover:opacity-70"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold">
        {roleHeading(role, audience)}
        {accountType ? ` — ${ACCOUNT_TYPE_LABELS[accountType]}` : null}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {accountType === "BUSINESS" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Company name
              <input
                type="text"
                required
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="rounded border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              VAT ID
              <input
                type="text"
                required
                value={vatId}
                onChange={(event) => setVatId(event.target.value)}
                className="rounded border px-3 py-2"
              />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              First name
              <input
                type="text"
                required
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="rounded border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Surname
              <input
                type="text"
                required
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="rounded border px-3 py-2"
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Phone number
          <input
            type="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

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
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        {role === "DRIVER" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              City
              <select
                required
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="rounded border px-3 py-2"
              >
                <option value="" disabled>
                  Select a city…
                </option>
                {GEORGIAN_CITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded border px-3 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>
    </main>
  );
}
