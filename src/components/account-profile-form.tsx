"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Client account type; mirrors the `ClientAccountType` Prisma enum. */
type AccountType = "INDIVIDUAL" | "BUSINESS";

/** Gender options; values mirror the `ClientGender` Prisma enum. */
const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * Profile fields as rendered by the account page's server component. All
 * identity and verification fields are nullable — a client may not have filled
 * them in yet — and `dateOfBirth` arrives pre-formatted as "YYYY-MM-DD" for
 * `<input type="date">`.
 */
export type AccountProfileInitialValues = {
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

/**
 * Inline identity editor on the account dashboard. Initial values come from the
 * server component, so there is no load state; saving upserts through
 * POST /api/client-profile.
 */
export function AccountProfileForm({
  email,
  initialValues,
}: {
  email: string;
  initialValues: AccountProfileInitialValues;
}) {
  const router = useRouter();

  const [firstName, setFirstName] = useState(initialValues.firstName ?? "");
  const [lastName, setLastName] = useState(initialValues.lastName ?? "");
  const [companyName, setCompanyName] = useState(
    initialValues.companyName ?? "",
  );
  const [vatId, setVatId] = useState(initialValues.vatId ?? "");
  const [phone, setPhone] = useState(initialValues.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(
    initialValues.dateOfBirth ?? "",
  );
  const [gender, setGender] = useState(initialValues.gender ?? "");
  const [idNumber, setIdNumber] = useState(initialValues.idNumber ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isBusiness = initialValues.accountType === "BUSINESS";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    // Re-send the full field set for the account type, mirroring the sign-up
    // follow-up call's shape.
    const body = isBusiness
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
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          payload?.error ?? "Could not save your profile. Please try again.",
        );
        return;
      }

      setSuccess(true);
      // The page header's display name is rendered from the saved profile, so
      // re-render the server component to keep it in sync.
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
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
          value={email}
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
            ID/Passport
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
        className="self-start rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
