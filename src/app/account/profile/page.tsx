"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useSession } from "@/lib/auth-client";

/** Client account type; mirrors the `ClientAccountType` Prisma enum. */
type AccountType = "INDIVIDUAL" | "BUSINESS";

/** Gender options; values mirror the `ClientGender` Prisma enum. */
const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * Shape of the profile returned by `GET /api/client-profile`. All identity and
 * verification fields are nullable — a client may not have filled them in yet.
 */
type ClientProfileResponse = {
  accountType: AccountType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  vatId: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  idNumber: string | null;
};

export default function ProfilePage() {
  const { data: session, isPending: sessionPending } = useSession();

  // Null while loading, then the fetched profile (or `null` if none exists).
  const [profile, setProfile] = useState<ClientProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable form fields.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [vatId, setVatId] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [idNumber, setIdNumber] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load the existing profile once a session is known. A 401/403 is surfaced as
  // a message rather than a crash; a `null` body is a valid "not completed" state.
  useEffect(() => {
    if (sessionPending) return;
    if (!session) {
      setProfileLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      try {
        const response = await fetch("/api/client-profile");
        if (!response.ok) {
          if (!cancelled) {
            setLoadError(
              response.status === 403
                ? "This page is for client accounts."
                : "Could not load your profile. Please try again.",
            );
          }
          return;
        }

        const data = (await response.json()) as ClientProfileResponse | null;
        if (cancelled) return;

        setProfile(data);
        if (data) {
          setFirstName(data.firstName ?? "");
          setLastName(data.lastName ?? "");
          setCompanyName(data.companyName ?? "");
          setVatId(data.vatId ?? "");
          setPhone(data.phone ?? "");
          // `<input type="date">` expects a bare "YYYY-MM-DD" value.
          setDateOfBirth(data.dateOfBirth ? data.dateOfBirth.slice(0, 10) : "");
          setGender(data.gender ?? "");
          setIdNumber(data.idNumber ?? "");
        }
      } catch {
        if (!cancelled) {
          setLoadError("Network error while loading your profile.");
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session, sessionPending]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setError(null);
    setSuccess(false);
    setSaving(true);

    // Re-send the full field set for the account type, mirroring the sign-up
    // follow-up call's shape.
    const body =
      profile.accountType === "BUSINESS"
        ? { accountType: "BUSINESS", companyName, vatId, phone }
        : {
            accountType: "INDIVIDUAL",
            firstName,
            lastName,
            phone,
            dateOfBirth: dateOfBirth || undefined,
            gender: gender || undefined,
            idNumber: idNumber || undefined,
          };

    try {
      const response = await fetch("/api/client-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(
          payload?.error ?? "Could not save your profile. Please try again.",
        );
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (sessionPending || profileLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
        <p className="text-center opacity-50">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">My profile</h1>
        <p className="opacity-70">Please sign in to manage your profile.</p>
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

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">My profile</h1>
        <p className="opacity-70">{loadError}</p>
        <div className="flex justify-center">
          <Link
            href="/"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            ← Back home
          </Link>
        </div>
      </main>
    );
  }

  // Edge case: signed in as a client but no profile row exists yet. We don't
  // guess an account type — point them back to sign-up to complete their fields.
  if (!profile) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">My profile</h1>
        <p className="opacity-70">
          Your profile isn&apos;t set up yet. Please complete your sign-up
          details first.
        </p>
        <div className="flex justify-center">
          <Link
            href="/account"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            ← Back to account
          </Link>
        </div>
      </main>
    );
  }

  const isBusiness = profile.accountType === "BUSINESS";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My profile</h1>
        <Link
          href="/account"
          className="text-sm font-medium hover:opacity-70"
        >
          ← Account
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isBusiness ? (
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
              Name
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
          Cell number
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
            readOnly
            value={session.user.email}
            className="rounded border px-3 py-2 opacity-60"
          />
        </label>

        {isBusiness ? null : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Date of birth
              <input
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="rounded border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Gender
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value)}
                className="rounded border px-3 py-2"
              >
                <option value="">Prefer not to say</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              ID number
              <input
                type="text"
                value={idNumber}
                onChange={(event) => setIdNumber(event.target.value)}
                className="rounded border px-3 py-2"
              />
            </label>
          </>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? (
          <p className="text-sm text-green-700">Profile saved.</p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded border px-3 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </main>
  );
}
