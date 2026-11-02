"use client";

import { useId } from "react";
import type * as React from "react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import type {
  GuestContactFieldError,
  GuestContactInput,
} from "@/lib/orders/guest-contact";

/**
 * "Your contact details" — what a guest (someone checking out without an
 * account) must leave before they can pay: first name, last name and phone,
 * plus an optional email.
 *
 * Purely presentational and fully controlled: the payment panel owns the
 * values, validates them with the same `parseGuestContact` the pay endpoint
 * runs, and decides which errors are visible (a field's own error once it has
 * been left, or the server's `fieldErrors` after a refused payment). This file
 * only lays the fields out and turns an error code into a sentence.
 *
 * The phone field mirrors `PhoneField` from the auth screens — a fixed `+995`
 * chip beside a national-number input — restyled in the checkout panels' own
 * tokens. A number typed with its own `+country` code is accepted too:
 * `normalizePhoneNumber` reads either.
 *
 * Colour rule: landing token utilities only, as on the rest of checkout.
 */

/** The four inputs, as typed — trimming and normalising are the parser's. */
export type GuestContactDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

export type GuestContactField = keyof GuestContactInput;

/** What a visible error under a field says: a parser code, or the server's own
 *  sentence when it sent one instead of a code. */
export type GuestContactVisibleErrors = Partial<
  Record<GuestContactField, GuestContactFieldError | string>
>;

const FIELD_CLASSES =
  "h-12 w-full min-w-0 rounded-lg border bg-ink px-3.5 text-sm text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

const FIELD_IDLE_BORDER = "border-line";
const FIELD_ERROR_BORDER = "border-accent";

const LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

export function GuestContactCard({
  value,
  onChange,
  onBlurField,
  errors,
  disabled,
}: {
  value: GuestContactDraft;
  onChange: (next: GuestContactDraft) => void;
  /** Marks a field as visited, so its own validation error may show. */
  onBlurField: (field: GuestContactField) => void;
  errors: GuestContactVisibleErrors;
  disabled?: boolean;
}): React.ReactElement {
  const t = useTranslations("checkout.guestContactCard");
  const headingId = useId();
  const fieldId = useId();

  function errorText(field: GuestContactField): string | null {
    const error = errors[field];
    if (!error) {
      return null;
    }
    if (error !== "required" && error !== "invalid") {
      // The server's own wording.
      return error;
    }
    switch (field) {
      case "firstName":
        return error === "required" ? t("firstNameRequired") : t("nameTooLong");
      case "lastName":
        return error === "required" ? t("lastNameRequired") : t("nameTooLong");
      case "phone":
        return error === "required" ? t("phoneRequired") : t("phoneInvalid");
      case "email":
        return t("emailInvalid");
    }
  }

  function field(
    name: GuestContactField,
    {
      label,
      required,
      type = "text",
      autoComplete,
      inputMode,
      placeholder,
      prefix,
    }: {
      label: string;
      required: boolean;
      type?: string;
      autoComplete: string;
      inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
      placeholder?: string;
      prefix?: string;
    },
  ) {
    const id = `${fieldId}-${name}`;
    const errorId = `${id}-error`;
    const message = errorText(name);

    const input = (
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value[name]}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, [name]: event.target.value })}
        onBlur={() => onBlurField(name)}
        aria-required={required ? "true" : undefined}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        className={`${FIELD_CLASSES} ${message ? FIELD_ERROR_BORDER : FIELD_IDLE_BORDER}`}
      />
    );

    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={id} className={LABEL_CLASSES}>
          {label}
          {required ? (
            <span aria-hidden="true" className="text-accent">
              *
            </span>
          ) : (
            <span className="font-normal text-muted">{t("optional")}</span>
          )}
          {prefix ? (
            <span className="sr-only">{t("countryCodeSr")}</span>
          ) : null}
        </Label>
        {prefix ? (
          <div className="flex gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-12 flex-none items-center rounded-lg border border-line bg-surface px-3 text-sm text-muted"
            >
              {prefix}
            </span>
            {input}
          </div>
        ) : (
          input
        )}
        {message ? (
          <p id={errorId} className="text-xs leading-snug text-accent">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2
        id={headingId}
        className="font-display text-base font-semibold text-paper"
      >
        {t("yourContactDetails")}
      </h2>
      <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
        {t("weUseTheseToReachYou")}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {field("firstName", {
          label: t("firstName"),
          required: true,
          autoComplete: "given-name",
        })}
        {field("lastName", {
          label: t("lastName"),
          required: true,
          autoComplete: "family-name",
        })}
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {field("phone", {
          label: t("phone"),
          required: true,
          type: "tel",
          inputMode: "tel",
          autoComplete: "tel-national",
          placeholder: "555 12 34 56",
          prefix: "+995",
        })}
        {field("email", {
          label: t("email"),
          required: false,
          type: "email",
          inputMode: "email",
          autoComplete: "email",
          // An address, so never translated (see the glossary).
          placeholder: "you@example.com",
        })}
      </div>
    </section>
  );
}
