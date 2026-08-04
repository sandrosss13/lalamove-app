"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signUp } from "@/lib/auth-client";

type Role = "CLIENT" | "DRIVER" | "COMPANY";
// Covers every account type across clients and drivers. Clients only ever set
// INDIVIDUAL or BUSINESS; drivers can additionally be an
// INDIVIDUAL_ENTREPRENEUR. A logistics company has no account-type variants and
// so never sets one.
type AccountType = "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "BUSINESS";

/**
 * Selectable driver cities. Values mirror the `GeorgianCity` Prisma enum; they
 * are duplicated here (rather than imported from `@prisma/client`) to keep the
 * server-only Prisma client out of the browser bundle.
 */
const GEORGIAN_CITY_OPTIONS = [
  { value: "TBILISI", label: "Tbilisi" },
  { value: "BATUMI", label: "Batumi" },
  { value: "KUTAISI", label: "Kutaisi" },
  { value: "RUSTAVI", label: "Rustavi" },
  { value: "ZUGDIDI", label: "Zugdidi" },
  { value: "GORI", label: "Gori" },
  { value: "POTI", label: "Poti" },
  { value: "SAMTREDIA", label: "Samtredia" },
  { value: "KHASHURI", label: "Khashuri" },
  { value: "SENAKI", label: "Senaki" },
  { value: "ZESTAPONI", label: "Zestaponi" },
  { value: "MARNEULI", label: "Marneuli" },
  { value: "TELAVI", label: "Telavi" },
  { value: "AKHALTSIKHE", label: "Akhaltsikhe" },
  { value: "OZURGETI", label: "Ozurgeti" },
  { value: "KOBULETI", label: "Kobuleti" },
  { value: "CHIATURA", label: "Chiatura" },
  { value: "TSKALTUBO", label: "Tskaltubo" },
  { value: "SAGAREJO", label: "Sagarejo" },
  { value: "GARDABANI", label: "Gardabani" },
  { value: "BOLNISI", label: "Bolnisi" },
  { value: "AKHALKALAKI", label: "Akhalkalaki" },
  { value: "BORJOMI", label: "Borjomi" },
  { value: "KASPI", label: "Kaspi" },
  { value: "MTSKHETA", label: "Mtskheta" },
] as const;

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
  COMPANY: "Sign up as a logistics company",
};

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Null until the user picks a role in step 1; picking one reveals step 2.
  const [role, setRole] = useState<Role | null>(null);
  // Null until the user picks an account type in step 2; picking one reveals
  // the form in step 3. Stays null for COMPANY, which has no account-type
  // variants and therefore skips step 2 entirely.
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
    // The form only renders in step 3, so `role` is always set here — and so is
    // `accountType` for every role except COMPANY, which has none. These guards
    // narrow the nullable state and are a defensive no-op in practice.
    if (!role) return;
    if (role !== "COMPANY" && !accountType) return;
    setError(null);
    setLoading(true);

    // Better Auth requires a `name`, but the form never shows a bare name
    // field — the identity fields are now identical across roles, so we derive
    // the name uniformly: the company name for a logistics company or a
    // business account, the full name otherwise.
    const resolvedName =
      role === "COMPANY" || accountType === "BUSINESS"
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

    // Logistics companies get a LogisticsCompany row instead of a client or
    // driver profile. Same failure handling as the branches above.
    if (role === "COMPANY") {
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
    }

    setLoading(false);
    router.push("/");
    router.refresh();
  }

  // Step 1: no role chosen yet — present the portals as large cards.
  if (role === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Create an account</h1>

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
            <span className="block font-medium">Logistics Company</span>
            <span className="block text-sm opacity-70">
              Run a fleet and dispatch your own drivers
            </span>
          </button>
        </div>
      </main>
    );
  }

  // Step 2: a role is chosen but no account type yet — present the account
  // types as large cards in the same style as step 1. Clients see two options;
  // drivers see three (adding Individual Entrepreneur). Companies have no
  // account-type variants, so they skip straight to the form in step 3.
  if (accountType === null && role !== "COMPANY") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
        <button
          type="button"
          onClick={() => setRole(null)}
          className="self-start text-sm hover:opacity-70"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-bold">{ROLE_HEADINGS[role]}</h1>

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

  // Step 3: role (and, for clients and drivers, account type) is chosen — show
  // the identity form. The field shapes are identical across roles; drivers and
  // companies additionally get a city select. A company skipped step 2, so its
  // Back button returns to the role picker rather than the account-type picker.
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <button
        type="button"
        onClick={() =>
          role === "COMPANY" ? setRole(null) : setAccountType(null)
        }
        className="self-start text-sm hover:opacity-70"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold">
        {ROLE_HEADINGS[role]}
        {accountType ? ` — ${ACCOUNT_TYPE_LABELS[accountType]}` : null}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {role === "COMPANY" || accountType === "BUSINESS" ? (
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

        {role === "DRIVER" || role === "COMPANY" ? (
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
