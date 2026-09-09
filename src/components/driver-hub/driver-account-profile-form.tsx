"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HubCard } from "@/components/driver-hub/hub-primitives";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import type { HubDriverAccountSettings } from "@/lib/dashboard/hub/account-settings";
import { cn } from "@/lib/utils";

/**
 * "Profile details" for a driver session — the design's `Driver Header.dc.html`
 * panel, whose note reads "Reuses the client's profile form — name, phone, ID,
 * city."
 *
 * ## Why this is not `AccountProfileForm`
 *
 * It cannot be. `src/components/account-profile-form.tsx` is CLIENT-scoped in
 * both halves:
 *
 * - **Its write path.** It `POST`s `/api/client-profile`, which answers any
 *   session whose role is not `CLIENT` with a `403` before it reads the body.
 *   A driver filling that form in would get "Could not save your profile" on
 *   every submit — the exact "control that appears to save and does not" this
 *   codebase forbids.
 * - **Its shape.** `AccountProfileInitialValues` mirrors `ClientProfile`
 *   columns — `ClientAccountType`, `gender`, `vatId`, `dateOfBirth` — and a
 *   driver has no `ClientProfile` row to fill them from.
 *
 * So this is the closest honest equivalent rather than a wrapper: the same
 * fields the design names, backed by `POST /api/driver-profile`, which *is*
 * the driver's own write path — a DRIVER-only upsert keyed on the user id,
 * already used by sign-up and the onboarding wizard, and idempotent on retry.
 * Every control below either saves through it or is visibly read-only.
 *
 * ## What is editable, and what is not
 *
 * The endpoint writes exactly `firstName`, `lastName`, `companyName`, `vatId`,
 * `phone` and `city`, so those are the inputs. Three fields are shown and
 * disabled instead:
 *
 * - **Email** — the sign-in identity, owned by Better Auth rather than by this
 *   profile record, the same as on the client's form.
 * - **ID / Passport** and **Date of birth** — collected once by the onboarding
 *   wizard and verified against an uploaded document. No endpoint writes them
 *   afterwards, and quietly dropping a typed value would be worse than not
 *   offering the field, so they are rendered as the record's own values with
 *   the reason stated under them.
 * - **Account type** is not rendered at all: `POST /api/driver-profile`
 *   deliberately freezes it (see the long comment there about the activation
 *   exploit that freeze closes), so there is nothing to show but a control
 *   that would always be refused.
 *
 * ## Styling
 *
 * The shadcn `Input`/`Button` defaults are used as they come, unlike on
 * `/account` where both are re-tokenised onto the landing palette. Inside the
 * hub's `[data-admin-surface]` those defaults already resolve to the neutral
 * light set the rest of these screens are drawn in — so re-tokenising here
 * would be undoing the fix rather than applying one.
 */

/** `DriverAccountType` values, as strings — see `HubDriverAccountSettings`. */
const BUSINESS_ACCOUNT_TYPE = "BUSINESS";

const FIELD_LABEL_CLASSES = "text-xs font-medium text-muted-foreground";

/** The design's red, matching every other error line in the hub. */
const ERROR_TEXT_CLASSES = "text-[13px] text-[oklch(44.4%_0.177_26.899)]";

const SUCCESS_TEXT_CLASSES = "text-[13px] text-[oklch(44.8%_0.119_151.328)]";

/** Inputs and the city select share one height and type scale. */
const CONTROL_CLASSES =
  "h-auto rounded-md px-[11px] py-[9px] text-sm md:text-sm";

/** A read-only control is legible but visibly not editable. */
const READONLY_CLASSES =
  "cursor-not-allowed bg-muted text-muted-foreground disabled:opacity-100";

const GENERIC_ERROR = "Could not save your profile. Please try again.";
const NETWORK_ERROR = "Network error. Please check your connection.";

/** Shown under a field the record holds but nothing in the app can rewrite. */
const VERIFIED_FIELD_NOTE =
  "Verified during onboarding. Contact support to correct it.";

/** Printed in a disabled field the profile has no value for. */
const EMPTY_VALUE = "Not recorded";

function Field({
  label,
  htmlFor,
  note,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  /** Muted line under the control — why it is read-only, usually. */
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className={FIELD_LABEL_CLASSES}>
        {label}
      </label>
      {children}
      {note ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

export type DriverAccountProfileFormProps = {
  settings: HubDriverAccountSettings;
};

export function DriverAccountProfileForm({
  settings,
}: DriverAccountProfileFormProps) {
  const router = useRouter();

  const isBusiness = settings.accountType === BUSINESS_ACCOUNT_TYPE;

  const [firstName, setFirstName] = React.useState(settings.firstName ?? "");
  const [lastName, setLastName] = React.useState(settings.lastName ?? "");
  const [companyName, setCompanyName] = React.useState(
    settings.companyName ?? "",
  );
  const [vatId, setVatId] = React.useState(settings.vatId ?? "");
  const [phone, setPhone] = React.useState(settings.phone);
  const [city, setCity] = React.useState(settings.city);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    // `accountType` rides along because the endpoint requires it on every call
    // and refuses a value that differs from the stored one; it is sent back
    // exactly as it was read, never from a control. The two branches mirror
    // the endpoint's own validation: a BUSINESS driver is identified by its
    // company name and VAT id, every other account type by a person's name.
    const body = isBusiness
      ? {
          accountType: settings.accountType,
          companyName,
          vatId,
          phone,
          city,
        }
      : {
          accountType: settings.accountType,
          firstName,
          lastName,
          phone,
          city,
        };

    try {
      const response = await fetch("/api/driver-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setError(payload?.error ?? GENERIC_ERROR);
        return;
      }

      setSaved(true);
      // The values above were rendered by the server component that owns this
      // page, and the hub header prints the same name and city in its account
      // chip. Refreshing re-runs both rather than leaving either holding the
      // profile as it was before this save.
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <HubCard>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div>
          <h2 className="text-base font-semibold">Profile details</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Your name, the number a client calls when they cannot find you, and
            the city you work out of.
          </p>
        </div>

        <div className="mt-5 grid min-w-0 gap-3.5 sm:grid-cols-2">
          {isBusiness ? (
            <>
              <Field label="Company name" htmlFor="driver-account-company">
                <Input
                  id="driver-account-company"
                  autoComplete="organization"
                  required
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className={CONTROL_CLASSES}
                />
              </Field>

              <Field label="VAT ID" htmlFor="driver-account-vat">
                <Input
                  id="driver-account-vat"
                  required
                  value={vatId}
                  onChange={(event) => setVatId(event.target.value)}
                  className={cn(CONTROL_CLASSES, "font-price")}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Name" htmlFor="driver-account-first-name">
                <Input
                  id="driver-account-first-name"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className={CONTROL_CLASSES}
                />
              </Field>

              <Field label="Surname" htmlFor="driver-account-last-name">
                <Input
                  id="driver-account-last-name"
                  autoComplete="family-name"
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className={CONTROL_CLASSES}
                />
              </Field>
            </>
          )}

          <Field label="Cell number" htmlFor="driver-account-phone">
            <Input
              id="driver-account-phone"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={cn(CONTROL_CLASSES, "font-price")}
            />
          </Field>

          {/* A native `<select>` rather than the shadcn one, for the reason the
              client's form gives and one more that is specific to this shell:
              Radix portals its content to `document.body`, outside the
              `[data-admin-surface]` subtree, so every portalled surface here
              has to repeat that attribute on itself. A plain select has no
              portal to mis-tone, and the list is 62 static options with no
              search behaviour attached to it. */}
          <Field label="City" htmlFor="driver-account-city">
            <select
              id="driver-account-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="h-auto w-full rounded-md border border-border bg-background px-[11px] py-[9px] text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {GEORGIAN_CITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Email"
            htmlFor="driver-account-email"
            note="The address you sign in with."
          >
            <Input
              id="driver-account-email"
              type="email"
              disabled
              value={settings.email}
              className={cn(CONTROL_CLASSES, READONLY_CLASSES)}
            />
          </Field>

          {isBusiness ? null : (
            <>
              <Field
                label="ID / Passport"
                htmlFor="driver-account-id-number"
                note={VERIFIED_FIELD_NOTE}
              >
                <Input
                  id="driver-account-id-number"
                  disabled
                  value={settings.idNumber ?? EMPTY_VALUE}
                  className={cn(
                    CONTROL_CLASSES,
                    READONLY_CLASSES,
                    settings.idNumber === null ? null : "font-price",
                  )}
                />
              </Field>

              <Field
                label="Date of birth"
                htmlFor="driver-account-dob"
                note={VERIFIED_FIELD_NOTE}
              >
                <Input
                  id="driver-account-dob"
                  disabled
                  value={settings.dateOfBirth ?? EMPTY_VALUE}
                  className={cn(
                    CONTROL_CLASSES,
                    READONLY_CLASSES,
                    settings.dateOfBirth === null ? null : "font-price",
                  )}
                />
              </Field>
            </>
          )}
        </div>

        {error ? (
          <p role="alert" className={cn("mt-4", ERROR_TEXT_CLASSES)}>
            {error}
          </p>
        ) : null}

        {saved ? (
          <p role="status" className={cn("mt-4", SUCCESS_TEXT_CLASSES)}>
            Profile saved.
          </p>
        ) : null}

        <div className="mt-5">
          <Button
            type="submit"
            disabled={saving}
            className="h-auto rounded-md bg-foreground px-[15px] py-[9px] text-[13px] font-medium text-background hover:bg-foreground/90"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </HubCard>
  );
}
