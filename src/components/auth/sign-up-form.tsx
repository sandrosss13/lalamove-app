"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AccountTypeStep } from "@/components/auth/account-type-step";
import {
  AuthHeading,
  AuthSubheading,
  BackLink,
  ERROR_INPUT_CLASS,
  Eyebrow,
  FieldError,
  FormAlert,
  InlineLinkButton,
  PasswordStrengthMeter,
  PhoneField,
} from "@/components/auth/auth-primitives";
import { AuthShell } from "@/components/auth/auth-shell";
import { RoleStep } from "@/components/auth/role-step";
import { SignUpSuccess } from "@/components/auth/sign-up-success";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signUp } from "@/lib/auth-client";
import {
  accountTypeLabel,
  accountTypeParam,
  isValidEmail,
  isValidGeorgianPhone,
  MIN_PASSWORD_LENGTH,
  MODE_PATHS,
  passwordStrength,
  phoneDigits,
  roleParam,
  ROLE_LABELS,
  type AccountType,
  type FlowMode,
  type FlowRole,
} from "@/lib/auth-flow";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { merchantOrigin, type Audience } from "@/lib/host";
import { cn } from "@/lib/utils";

/**
 * The registration wizard — screens 1, 2, 7 and 8 of the auth handoff
 * (`UI:UX/Sign-in:up/design_handoff_auth_redesign/README.md`).
 *
 * ## Where the wizard's position lives
 *
 * In the query string, not in state: `/sign-up?role=driver&type=business`. The
 * page component parses and *validates* those params and hands the result down
 * as props, so this component never reads the URL itself and never has to
 * decide whether a value is trustworthy — by the time it arrives, it is. Every
 * step advances with `router.push`, which is what makes browser back/forward
 * walk the wizard a step at a time and a refresh stay where it was.
 *
 * Only step 3's field values are component state, because they are the only
 * thing that is neither a position in the flow nor safe to put in a URL.
 *
 * ## The audience split
 *
 * Scoped to the audience of the host it is served from (`src/lib/host.ts`). The
 * form itself — the fields, the follow-up profile writes — is identical for
 * every audience; only which roles step 1 offers and the post-success
 * destination differ:
 *
 * - `"BOTH"` (split disabled): the full two-role wizard.
 * - `"CLIENT"`: step 1 offers two cards — Client, which continues the wizard
 *   here, and Driver, which is a cross-origin link to the merchant host's own
 *   sign-up page rather than a role this host can create.
 * - `"MERCHANT"`: only the Driver card is offered, and a newly created account
 *   lands on `/dashboard` rather than `/`, which is a client-host path the
 *   merchant host would immediately bounce it off.
 *
 * The Driver card is not one-to-one with the DRIVER role: picking the Business
 * account type in step 2 resolves it to a COMPANY account with a
 * `LogisticsCompany` row instead (see `isCompanySignUp` in `handleSubmit`).
 *
 * ## What the redesign dropped on purpose
 *
 * The old wizard varied its heading by role and audience ("Sign up as an
 * individual driver", "Sign up as a logistics company"). The new design puts a
 * fixed "Create your account" over a context sub-line that names the role and
 * type instead, so those per-audience headings — and the merchant host's
 * "Individual Driver" card label — are gone. The step-1 card now reads "Driver
 * or fleet", which covers the individual, the entrepreneur and the company that
 * step 2 goes on to separate, and is correct on the merchant host too.
 */

/* -------------------------------------------------------------------------- */
/* The role written to `User.role`                                            */
/* -------------------------------------------------------------------------- */

/**
 * The role actually written to `User.role`. COMPANY is not a card: it is what
 * the Driver card resolves to once the Business account type is picked, which
 * is the path someone registering a haulage business already takes today.
 */
type SignUpRole = FlowRole | "COMPANY";

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Builds a flow URL carrying whatever the user has answered so far.
 *
 * Every navigation in this file goes through here so the two params are
 * serialised in one place and in one casing (`roleParam` / `accountTypeParam`
 * only ever emit lowercase, which is what the parsers round-trip exactly).
 * A `null` is simply omitted, which is how "not answered yet" is spelled — the
 * absence of `type` is what puts the wizard on step 2.
 */
function flowHref(
  path: string,
  role: FlowRole | null,
  accountType: AccountType | null,
): string {
  const params = new URLSearchParams();

  if (role !== null) {
    params.set("role", roleParam(role));
  }
  if (accountType !== null) {
    params.set("type", accountTypeParam(accountType));
  }

  const query = params.toString();
  return query.length > 0 ? `${path}?${query}` : path;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** Every field step 3 can complain about. */
type SignUpFieldKey =
  | "firstName"
  | "lastName"
  | "companyName"
  | "vatId"
  | "phone"
  | "email"
  | "password"
  | "city"
  | "terms";

type FieldErrors = Partial<Record<SignUpFieldKey, string>>;

/** The raw field values, exactly as typed. */
type SignUpValues = {
  firstName: string;
  lastName: string;
  companyName: string;
  vatId: string;
  phone: string;
  email: string;
  password: string;
  city: string;
  termsAccepted: boolean;
};

/**
 * The handoff's "Validation" section, as a pure function of the form's values.
 *
 * Kept out of the component so the rules can be read as a list rather than
 * traced through a submit handler, and so the handler's only job is deciding
 * what to do with the result.
 *
 * Client-side validation is a courtesy, never the authority: `src/lib/auth.ts`
 * and the three profile routes enforce their own requirements, and anything
 * that gets past this still fails there and surfaces through `FormAlert`.
 */
function validateSignUp(
  role: FlowRole,
  accountType: AccountType,
  values: SignUpValues,
): FieldErrors {
  const errors: FieldErrors = {};

  // The identity fields swap wholesale on a business account: a company has a
  // registered name and a VAT ID where a person has a first name and a surname.
  if (accountType === "BUSINESS") {
    if (values.companyName.trim().length === 0) {
      errors.companyName = "Enter your registered company name.";
    }
    if (values.vatId.trim().length === 0) {
      errors.vatId = "Enter your VAT ID.";
    }
  } else {
    if (values.firstName.trim().length === 0) {
      errors.firstName = "Enter your first name.";
    }
    if (values.lastName.trim().length === 0) {
      errors.lastName = "Enter your surname.";
    }
  }

  if (!isValidGeorgianPhone(phoneDigits(values.phone))) {
    errors.phone = "Enter the 9 digits that follow +995.";
  }

  if (!isValidEmail(values.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  // Drivers only. A `DriverProfile` cannot be written without a city, and a
  // `LogisticsCompany` is registered in one — clients are never asked.
  if (role === "DRIVER" && values.city.length === 0) {
    errors.city = "Select the city you are based in.";
  }

  if (!values.termsAccepted) {
    errors.terms = "Accept the terms and the privacy policy to continue.";
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Field plumbing                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A field's helper and error ids are derived from its own id rather than
 * generated separately, so `aria-describedby` can be assembled without keeping
 * a second set of ids in sync. Same shape `PhoneField` uses internally.
 */
function helperIdFor(fieldId: string): string {
  return `${fieldId}-helper`;
}

function errorIdFor(fieldId: string): string {
  return `${fieldId}-error`;
}

function describedBy(
  fieldId: string,
  hasHelper: boolean,
  hasError: boolean,
): string | undefined {
  return (
    [
      hasHelper ? helperIdFor(fieldId) : null,
      hasError ? errorIdFor(fieldId) : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: React.ComponentProps<"input">["type"];
  placeholder?: string;
  autoComplete?: string;
  /** Muted line under the control. */
  helper?: React.ReactNode;
  /** Non-empty switches the input to the error styling and announces it. */
  error?: string;
  /** Rendered between the input and its helper — the strength meter. */
  children?: React.ReactNode;
};

/**
 * One labelled text field in the handoff's shape: `Label`, a 44px `Input`, and
 * the helper/error lines beneath it.
 *
 * Every field on this form is required, so `aria-required` is unconditional —
 * and it is `aria-required` rather than the HTML `required` attribute for the
 * reason `job-sheet-actions.tsx` gives at its waiting-minutes field: the form
 * validates in `handleSubmit` so the messages are the ones this design
 * specifies, and a native `required` would put a browser bubble on top of them
 * saying something we did not write. This announces the obligation without
 * changing the behaviour.
 */
function TextField({
  id,
  label,
  value,
  onChange,
  type,
  placeholder,
  autoComplete,
  helper,
  error,
  children,
}: TextFieldProps) {
  const hasHelper = helper !== undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hasHelper, Boolean(error))}
        className={cn("h-11 text-base", error && ERROR_INPUT_CLASS)}
      />
      {children}
      {hasHelper ? (
        <span
          id={helperIdFor(id)}
          className="text-[13px] text-[var(--landing-muted)]"
        >
          {helper}
        </span>
      ) : null}
      {error ? <FieldError id={errorIdFor(id)}>{error}</FieldError> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The wizard                                                                 */
/* -------------------------------------------------------------------------- */

export type SignUpFormProps = {
  audience: Audience;
  /** Step 1's answer, already checked against the audience by the page. */
  role: FlowRole | null;
  /** Step 2's answer, already checked against the role by the page. */
  accountType: AccountType | null;
};

export function SignUpForm({ audience, role, accountType }: SignUpFormProps) {
  const router = useRouter();
  // One generated base per mount; every field id and every `aria-describedby`
  // target is derived from it, so nothing on the page can collide with it.
  const fieldId = React.useId();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [vatId, setVatId] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [city, setCity] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  /** Server- and API-level failures. Rendered as the alert above the fields. */
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  /**
   * Set once the account and its profile row both exist. Holds the picks and
   * the destination rather than reading them back from props, because the
   * success screen must keep saying what was created even though nothing about
   * the URL changes underneath it.
   */
  const [created, setCreated] = React.useState<{
    role: FlowRole;
    accountType: AccountType;
    destination: string;
  } | null>(null);

  /** Clears one field's error as soon as the user acts on that field. */
  function clearFieldError(key: SignUpFieldKey) {
    setFieldErrors((previous) => {
      if (previous[key] === undefined) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form only renders in step 3, which every role reaches by way of
    // steps 1 and 2, so both `role` and `accountType` are always set here.
    // These guards narrow the nullable props and are a defensive no-op in
    // practice.
    if (!role) return;
    if (!accountType) return;

    const nextErrors = validateSignUp(role, accountType, {
      firstName,
      lastName,
      companyName,
      vatId,
      phone,
      email,
      password,
      city,
      termsAccepted,
    });

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      // Each message is already rendered against its own field and reachable
      // through that field's `aria-describedby`, so the form-level alert is
      // cleared rather than restating them in a second place.
      setFormError(null);
      return;
    }

    setFormError(null);
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
      setFormError(
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
        setFormError(
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
        setFormError(
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
        setFormError(
          payload?.error ??
            "Could not save your account details. Please try again.",
        );
        setLoading(false);
        return;
      }
    }

    setLoading(false);

    // TODO: phone verification slots in here, between the profile write and the
    // success screen — the number is collected above and the handoff draws an
    // OTP screen for it (section 4), but `src/lib/auth.ts` configures only
    // `emailAndPassword` with no `phoneNumber` / `emailOTP` plugin, so there is
    // no endpoint to send or check a code against. Until one exists, sending
    // the user to an OTP screen the way the prototype does would be a dead end,
    // so the flow completes here.

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
    //
    // The navigation itself (`router.push` then `router.refresh`) now happens
    // in `SignUpSuccess`, once its progress bar has run — same destination,
    // same pair of calls, just after the beat screen 8 asks for.
    setCreated({
      role,
      accountType,
      destination:
        isCompanySignUp || audience === "MERCHANT" ? "/dashboard" : "/",
    });
  }

  /* ------------------------------------------------------------------ */
  /* Screen 8 — success                                                 */
  /* ------------------------------------------------------------------ */

  // Checked before the step branches below: the URL still says `?role=…&type=…`
  // at this point, so nothing about the props has changed and step 3 would
  // otherwise render straight over the account that was just created.
  if (created !== null) {
    return (
      <SignUpSuccess
        role={created.role}
        accountType={created.accountType}
        destination={created.destination}
      />
    );
  }

  /* ------------------------------------------------------------------ */
  /* Screen 1 — role                                                    */
  /* ------------------------------------------------------------------ */

  if (role === null) {
    // Which cards step 1 *shows*, which is a different question from which
    // roles this host may create (the page component owns that one, because it
    // is the trust boundary for the query string). The client host shows a
    // Driver card it cannot fulfil on purpose — as a link to the host that can.
    //
    // `merchantOrigin()` is only null while the split is disabled — an audience
    // of "CLIENT" means it is on — so the empty-string fallback (which degrades
    // to a same-host "/sign-up") is purely defensive.
    const roles: readonly FlowRole[] =
      audience === "MERCHANT" ? ["DRIVER"] : ["CLIENT", "DRIVER"];
    const hrefs =
      audience === "CLIENT"
        ? { DRIVER: `${merchantOrigin() ?? ""}/sign-up` }
        : undefined;

    /**
     * The toggle switches which flow the wizard *ends* in, and nothing else —
     * it must never skip step 2, which both modes run through. Since role and
     * type are still unanswered here, the sign-in route is entered at its own
     * step 1; `flowHref` carries whatever has been picked anyway, so this stays
     * correct if the toggle is ever shown on a later step.
     *
     * Selecting the segment that is already active is a no-op rather than a
     * navigation to the page we are already on.
     */
    const handleModeChange = (mode: FlowMode) => {
      if (mode === "signup") return;
      router.push(flowHref(MODE_PATHS[mode], role, accountType));
    };

    return (
      <AuthShell maxWidth="860">
        <RoleStep
          mode="signup"
          onModeChange={handleModeChange}
          onSelectRole={(picked) =>
            router.push(flowHref("/sign-up", picked, null))
          }
          roles={roles}
          hrefs={hrefs}
        />
      </AuthShell>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Screen 2 — account type                                            */
  /* ------------------------------------------------------------------ */

  if (accountType === null) {
    return (
      <AuthShell maxWidth="560">
        <AccountTypeStep
          role={role}
          // Always null, and necessarily so: `?type=` present *is* step 3, so
          // there is no URL that means "on step 2 with a type already picked".
          // Stepping back from step 3 therefore drops the param — which is what
          // makes step 2 render at all — and the row set comes up unselected.
          // `AccountTypeStep`'s selected styling is still live for the sign-in
          // flow; this branch just cannot reach it.
          value={null}
          onSelect={(picked) => router.push(flowHref("/sign-up", role, picked))}
          onBack={() => router.push(flowHref("/sign-up", null, null))}
        />
      </AuthShell>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Screen 7 — details                                                 */
  /* ------------------------------------------------------------------ */

  const firstNameId = `${fieldId}-first-name`;
  const lastNameId = `${fieldId}-last-name`;
  const companyNameId = `${fieldId}-company-name`;
  const vatIdId = `${fieldId}-vat-id`;
  const phoneId = `${fieldId}-phone`;
  const emailId = `${fieldId}-email`;
  const passwordId = `${fieldId}-password`;
  const cityId = `${fieldId}-city`;
  const termsId = `${fieldId}-terms`;

  return (
    <AuthShell maxWidth="420" className="gap-6">
      <BackLink onClick={() => router.push(flowHref("/sign-up", role, null))} />

      <div className="flex flex-col gap-2.5">
        <Eyebrow>Step 3 of 3 · Details</Eyebrow>
        <AuthHeading>Create your account</AuthHeading>
        <AuthSubheading>
          {ROLE_LABELS[role]} · {accountTypeLabel(accountType)} · takes about a
          minute.
        </AuthSubheading>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert title={formError} /> : null}

        {accountType === "BUSINESS" ? (
          /*
            The handoff never designed the business identity fields — its
            section 7 says "not designed yet, follow the same field pattern or
            ask before building". This is that fallback: the same `Label` + 44px
            `Input` pattern as every other field, in the slot the name row
            occupies for an individual. They are not optional extras —
            `/api/logistics-company` and `/api/client-profile` both require a
            company name and a VAT ID, so a business account cannot be completed
            without them.
          */
          <>
            <TextField
              id={companyNameId}
              label="Company name"
              value={companyName}
              onChange={(value) => {
                setCompanyName(value);
                clearFieldError("companyName");
              }}
              autoComplete="organization"
              error={fieldErrors.companyName}
            />
            <TextField
              id={vatIdId}
              label="VAT ID"
              value={vatId}
              onChange={(value) => {
                setVatId(value);
                clearFieldError("vatId");
              }}
              autoComplete="off"
              error={fieldErrors.vatId}
            />
          </>
        ) : (
          /* `auto-fit` with a 150px floor is what drops the pair to one column
             under ~330px — no breakpoint to keep in sync with the content. */
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <TextField
              id={firstNameId}
              label="First name"
              value={firstName}
              onChange={(value) => {
                setFirstName(value);
                clearFieldError("firstName");
              }}
              autoComplete="given-name"
              error={fieldErrors.firstName}
            />
            <TextField
              id={lastNameId}
              label="Surname"
              value={lastName}
              onChange={(value) => {
                setLastName(value);
                clearFieldError("lastName");
              }}
              autoComplete="family-name"
              error={fieldErrors.lastName}
            />
          </div>
        )}

        <PhoneField
          id={phoneId}
          value={phone}
          onChange={(value) => {
            setPhone(value);
            clearFieldError("phone");
          }}
          helper="Used to verify your account and to reach you about a delivery."
          error={fieldErrors.phone}
          // `PhoneField` now maps `required` to `aria-required`, not to the HTML
          // attribute, so this announces the obligation the way every other
          // field on this form does without letting a browser bubble fire ahead
          // of `validateSignUp`'s message. The validation itself is unchanged
          // and still lives in `handleSubmit`: an empty or malformed number
          // fails `isValidGeorgianPhone` there and blocks the submit.
          required
        />

        <TextField
          id={emailId}
          label="Email"
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            clearFieldError("email");
          }}
          placeholder="you@company.ge"
          autoComplete="email"
          error={fieldErrors.email}
        />

        <TextField
          id={passwordId}
          label="Password"
          type="password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            clearFieldError("password");
          }}
          autoComplete="new-password"
          helper="At least 8 characters. Add a number to make it stronger."
          error={fieldErrors.password}
        >
          <PasswordStrengthMeter strength={passwordStrength(password)} />
        </TextField>

        {/* Drivers only, exactly as before the redesign: a `DriverProfile` and a
            `LogisticsCompany` both require a city, and a client is never asked
            for one. Migrated from the old native `<select>` to the DS `Select`
            the handoff specifies. */}
        {role === "DRIVER" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={cityId}>City</Label>
            <Select
              value={city}
              onValueChange={(value) => {
                setCity(value);
                clearFieldError("city");
              }}
            >
              <SelectTrigger
                id={cityId}
                aria-required="true"
                aria-invalid={fieldErrors.city ? true : undefined}
                aria-describedby={describedBy(
                  cityId,
                  false,
                  Boolean(fieldErrors.city),
                )}
                // `data-[size=default]:h-11` alongside the plain `h-11` the
                // handoff asks for: `SelectTrigger` writes its own height as
                // `data-[size=default]:h-8`, and an attribute selector
                // out-specifies a bare class — without this the trigger would
                // keep its 32px and sit a step shorter than every input above
                // it. Same fix `drivers-add-panel.tsx` makes.
                className={cn(
                  "h-11 w-full text-base data-[size=default]:h-11",
                  fieldErrors.city && ERROR_INPUT_CLASS,
                )}
              >
                <SelectValue placeholder="Select a city…" />
              </SelectTrigger>
              {/* Portalled out of the shell's subtree, so it has to carry
                  `data-admin-surface` itself or it renders in the site palette
                  (and, for a visitor in dark mode, in the dark one). */}
              <SelectContent data-admin-surface="" className="max-h-72">
                {GEORGIAN_CITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.city ? (
              <FieldError id={errorIdFor(cityId)}>
                {fieldErrors.city}
              </FieldError>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {/* Checkbox and label as siblings tied by `htmlFor`, the pairing the
              rest of the app uses (`static-page-form-dialog.tsx` and friends)
              rather than nesting the control inside the `<label>`: Radix's
              checkbox is a `<button>`, and a labelable control inside its own
              label is the one arrangement where a stray second activation is
              even possible. */}
          <div className="flex items-start gap-2.5">
            <Checkbox
              id={termsId}
              checked={termsAccepted}
              // Radix models a third, indeterminate state; this box has only
              // two, so anything that is not literally `true` is unchecked.
              onCheckedChange={(checked) => {
                setTermsAccepted(checked === true);
                clearFieldError("terms");
              }}
              aria-required="true"
              aria-invalid={fieldErrors.terms ? true : undefined}
              aria-describedby={describedBy(
                termsId,
                false,
                Boolean(fieldErrors.terms),
              )}
              // The box is 16px against a 19.5px line, so it needs a nudge to
              // sit on the text's first line rather than above it.
              className="mt-0.5"
            />
            <Label
              htmlFor={termsId}
              className="text-[13px] leading-[1.5] font-normal text-[#3f3c36]"
            >
              {/*
                TODO: link these two phrases once the pages exist. The route is
                already there — `/pages/[slug]` in `src/app/(public)` serves the
                back office's Static Pages section — but nothing seeds a `terms`
                or a `privacy` slug, so `/pages/terms` and `/pages/privacy` are
                both 404s today. Until staff publish them these stay plain text
                with the handoff's underline: a dead `href="#"` would land
                keyboard focus on something that does nothing, which is the same
                call `auth-shell.tsx` makes for its "Need help?" link.
              */}
              <span>
                I agree to the{" "}
                <span className="underline decoration-[#d8d4cb] underline-offset-4">
                  terms of service
                </span>{" "}
                and the{" "}
                <span className="underline decoration-[#d8d4cb] underline-offset-4">
                  privacy policy
                </span>
                .
              </span>
            </Label>
          </div>
          {fieldErrors.terms ? (
            <FieldError id={errorIdFor(termsId)}>
              {fieldErrors.terms}
            </FieldError>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full text-base"
        >
          {loading ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-sm text-[var(--landing-muted)]">
          Already registered?{" "}
          <InlineLinkButton
            href={flowHref(MODE_PATHS.signin, role, accountType)}
          >
            Sign in
          </InlineLinkButton>
        </p>
      </form>
    </AuthShell>
  );
}
