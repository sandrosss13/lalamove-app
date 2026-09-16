"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Client account type; mirrors the `ClientAccountType` Prisma enum. */
type AccountType = "INDIVIDUAL" | "BUSINESS";

/** Gender options; values mirror the `ClientGender` Prisma enum. */
const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * Shared field styling for this surface.
 *
 * The shadcn primitives ship a light/dark-flipping token set this page never
 * opted into (`border-input`, `bg-background`, `focus-visible:ring-ring`), so
 * each of those defaults is replaced by the landing palette's equivalent — the
 * same re-tokenising `booking-form.tsx` does to its `Textarea` and `Card`.
 * Without it a visitor in system dark mode gets near-black controls on this
 * page's fixed white background.
 */
const FIELD_INPUT_CLASSES =
  "h-10 border-line bg-ink text-sm text-paper placeholder:text-muted focus-visible:border-accent focus-visible:ring-accent/20";

const FIELD_LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

/** Read-only fields are legible but visibly not editable. */
const FIELD_READONLY_CLASSES = "cursor-not-allowed bg-surface text-muted";

const MESSAGE_BASE_CLASSES =
  "rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-snug";

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

/** One labelled field of the grid. */
function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  /** Grid placement, e.g. a full-width row. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={FIELD_LABEL_CLASSES}>
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * The "Personal details" card on `/account`: the client's own identity and
 * contact details, edited in place. Initial values come from the server
 * component, so there is no load state; saving upserts through
 * POST /api/client-profile.
 *
 * Which fields exist depends on the account type, because the two are verified
 * differently: a business is identified by its company name and VAT ID, an
 * individual by their name and (optionally) date of birth, gender and ID or
 * passport number. The account type itself is not editable here — it is fixed
 * at sign-up and the API keys the profile off it.
 */
export function AccountProfileForm({
  email,
  initialValues,
}: {
  email: string;
  initialValues: AccountProfileInitialValues;
}) {
  const router = useRouter();
  const fieldId = useId();

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
      // This form's initial values are rendered by the server component above
      // it, so re-render that tree rather than leaving it holding the profile
      // as it was before this save.
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-4 bg-ink text-paper ring-line">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold text-paper">
          Personal details
        </CardTitle>
        <CardDescription className="text-[0.8125rem] leading-snug text-muted">
          {isBusiness
            ? "Who the delivery is billed to, and how a driver reaches you about a pickup."
            : "How a driver identifies and reaches you when they arrive for a pickup."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {isBusiness ? (
              <>
                <Field id={`${fieldId}-company`} label="Company name">
                  <Input
                    id={`${fieldId}-company`}
                    type="text"
                    autoComplete="organization"
                    required
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    className={FIELD_INPUT_CLASSES}
                  />
                </Field>

                <Field id={`${fieldId}-vat`} label="VAT ID">
                  <Input
                    id={`${fieldId}-vat`}
                    type="text"
                    required
                    value={vatId}
                    onChange={(event) => setVatId(event.target.value)}
                    className={FIELD_INPUT_CLASSES}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field id={`${fieldId}-first-name`} label="Name">
                  <Input
                    id={`${fieldId}-first-name`}
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className={FIELD_INPUT_CLASSES}
                  />
                </Field>

                <Field id={`${fieldId}-last-name`} label="Surname">
                  <Input
                    id={`${fieldId}-last-name`}
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className={FIELD_INPUT_CLASSES}
                  />
                </Field>
              </>
            )}

            <Field id={`${fieldId}-phone`} label="Cell number">
              <Input
                id={`${fieldId}-phone`}
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={FIELD_INPUT_CLASSES}
              />
            </Field>

            {/* Read-only: the email is the account's sign-in identity, owned by
                Better Auth, not by this profile record. */}
            <Field id={`${fieldId}-email`} label="Email">
              <Input
                id={`${fieldId}-email`}
                type="email"
                readOnly
                value={email}
                className={cn(FIELD_INPUT_CLASSES, FIELD_READONLY_CLASSES)}
              />
            </Field>

            {isBusiness ? null : (
              <>
                <Field id={`${fieldId}-dob`} label="Date of birth">
                  <Input
                    id={`${fieldId}-dob`}
                    type="date"
                    value={dateOfBirth}
                    onChange={(event) => setDateOfBirth(event.target.value)}
                    className={FIELD_INPUT_CLASSES}
                  />
                </Field>

                {/* A native `<select>` rather than the shadcn one: its list is
                    three fixed options, and the Radix version portals its
                    content to `document.body`, outside this page's palette. */}
                <Field id={`${fieldId}-gender`} label="Gender">
                  <select
                    id={`${fieldId}-gender`}
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    className="h-10 w-full rounded-lg border border-line bg-ink px-2.5 text-sm text-paper transition-colors outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20"
                  >
                    <option value="">Prefer not to say</option>
                    {GENDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id={`${fieldId}-id-number`} label="ID / Passport">
                  <Input
                    id={`${fieldId}-id-number`}
                    type="text"
                    value={idNumber}
                    onChange={(event) => setIdNumber(event.target.value)}
                    className={FIELD_INPUT_CLASSES}
                  />
                </Field>
              </>
            )}
          </div>

          {error ? (
            <p
              role="alert"
              className={cn(
                MESSAGE_BASE_CLASSES,
                "border-accent/30 bg-accent/10 text-accent",
              )}
            >
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className={cn(
                MESSAGE_BASE_CLASSES,
                // Kept identical to the "Password updated." banner in
                // `account-password-card.tsx`, which carries the long note on
                // why the dark half is spelled out rather than derived: the two
                // sit on the same `/account` page and must not read as two
                // different kinds of success.
                "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
              )}
            >
              Profile saved.
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={saving}
            className="h-10 self-start rounded-full bg-accent px-5 text-[0.8125rem] font-semibold text-ink hover:bg-accent"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
