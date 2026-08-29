"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-types";
import { signUp } from "@/lib/auth-client";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { merchantOrigin, type Audience } from "@/lib/host";

/** The two cards step 1 offers. */
type Role = "CLIENT" | "DRIVER";

/**
 * The role actually written to `User.role`. COMPANY is not a card: it is what
 * the Driver card resolves to once the Business account type is picked, which
 * is the path someone registering a haulage business already takes today.
 */
type SignUpRole = Role | "COMPANY";

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
 *
 * `pickedAccountType` is null in step 2, where no account type has been chosen
 * yet, so that step's wording is unaffected by the company branch below.
 */
function roleHeading(
  pickedRole: Role,
  currentAudience: Audience,
  pickedAccountType: AccountType | null,
): string {
  if (pickedRole === "DRIVER" && pickedAccountType === "BUSINESS") {
    return "Sign up as a logistics company";
  }

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
 * - `"MERCHANT"`: only the DRIVER card (labelled "Individual Driver" here) is
 *   offered, and a newly created account lands on `/dashboard` rather than `/`,
 *   which is a client-host path the merchant host would immediately bounce it
 *   off.
 *
 * The Driver card is not one-to-one with the DRIVER role: picking the Business
 * account type in step 2 resolves it to a COMPANY account with a
 * `LogisticsCompany` row instead (see `isCompanySignUp` in `handleSubmit`).
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

    // The Driver card plus the Business account type is a logistics company,
    // not a driver. No audience branch is needed: the client host renders its
    // Driver card as a cross-origin link rather than a role it can create, so
    // this combination is only reachable on the merchant host and on "BOTH",
    // where COMPANY is legitimate. `src/lib/auth.ts`'s `before` hook is the
    // server-side backstop either way.
    const isCompanySignUp = role === "DRIVER" && accountType === "BUSINESS";
    const resolvedRole: SignUpRole = isCompanySignUp ? "COMPANY" : role;

    const { error: signUpError } = await signUp.email({
      name: resolvedName,
      email,
      password,
      role: resolvedRole,
    });

    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message ?? "Something went wrong. Please try again.",
      );
      return;
    }

    // Better Auth has created the account and a session by this point. A
    // company creates a LogisticsCompany row instead of a DriverProfile — the
    // two are mutually exclusive, hence the `else if` below.
    //
    // The body is exactly the four fields the route requires. The six fields
    // step 1 of the onboarding wizard collects are optional on this endpoint
    // and are deliberately not sent from here: a registration form that
    // demanded an IBAN before the account existed would be a worse funnel, and
    // the upsert is keyed on the user id, so the wizard fills them in later on
    // the very same row.
    //
    // Same failure handling as the two branches below: the account exists by
    // now, so surface the server's own message and stay put rather than
    // navigating away as if everything succeeded. A duplicate phone arrives as
    // a 409 whose message is the useful one, so it is rendered verbatim from
    // `payload.error` rather than restated as a constant here.
    if (isCompanySignUp) {
      const response = await fetch("/api/logistics-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, vatId, phone, city }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          payload?.error ??
            "Could not save your company details. Please try again.",
        );
        setLoading(false);
        return;
      }
    } else if (role === "DRIVER") {
      // Drivers must additionally create a DriverProfile with their identity
      // details and city.
      //
      // Only Individual and Individual Entrepreneur reach here: `isCompanySignUp`
      // above captures DRIVER + BUSINESS on every audience and routes it to a
      // COMPANY account with a `LogisticsCompany` instead, so this branch never
      // sees a BUSINESS account type. The company-shaped body this used to send
      // (`companyName`/`vatId`) would therefore be dead code, and is gone.
      const response = await fetch("/api/driver-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType,
          firstName,
          lastName,
          phone,
          city,
        }),
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
    // up on. Every other audience owns `/`, except for a new company: `/` is
    // the client landing page and a company has nothing there, so it lands on
    // `/dashboard` whatever the audience.
    //
    // `/dashboard` is the end of this form's responsibility. Deciding where a
    // COMPANY session goes from there — the onboarding wizard, the application
    // status screen or the ops dashboard — needs the application row, which
    // this form has not read, so no onboarding path is pushed here and no
    // second redirect is chained.
    router.push(
      isCompanySignUp || audience === "MERCHANT" ? "/dashboard" : "/",
    );
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

        {/* No account type is picked yet, so the heading cannot yet know
            whether this is the company branch. */}
        <h1 className="text-2xl font-bold">
          {roleHeading(role, audience, null)}
        </h1>

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
            {/* Same card in the same place; only what it produces changed.
                Under the Driver role it now creates a logistics company rather
                than a business-type driver, so it says so. */}
            <span className="block text-sm opacity-70">
              {role === "DRIVER"
                ? "Register a logistics company running more than one vehicle"
                : "Sign up as a registered company"}
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

      {/* The company branch's heading already names the account type, so the
          suffix would only add "— Business" noise to it. */}
      <h1 className="text-2xl font-bold">
        {roleHeading(role, audience, accountType)}
        {role === "DRIVER" && accountType === "BUSINESS"
          ? null
          : ` — ${ACCOUNT_TYPE_LABELS[accountType]}`}
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
