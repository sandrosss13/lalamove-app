"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AccountTypeStep } from "@/components/auth/account-type-step";
import {
  AuthHeading,
  AuthSubheading,
  BackLink,
  ContextChip,
  ERROR_INPUT_CLASS,
  FieldError,
  FormAlert,
  InlineLinkButton,
  PhoneField,
  SocialBlock,
} from "@/components/auth/auth-primitives";
import { AuthShell } from "@/components/auth/auth-shell";
import { RoleStep } from "@/components/auth/role-step";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-types";
import {
  accountTypeParam,
  accountTypeRowsForRole,
  isValidEmail,
  MODE_PATHS,
  parseAccountType,
  parseRole,
  roleParam,
  type FlowMode,
  type FlowRole,
} from "@/lib/auth-flow";
import { signIn, signOut, authClient } from "@/lib/auth-client";
import { merchantOrigin, type Audience } from "@/lib/host";
import { cn } from "@/lib/utils";

/**
 * Every portal this form can resolve to. COMPANY is not its own step-1 card —
 * it is what the Driver card plus the Business account type resolves to,
 * mirroring the sign-up wizard step for step so that what a user picked when
 * registering is exactly what they pick when returning.
 *
 * `FlowRole` (from `@/lib/auth-flow`) is the narrower set that step 1 offers as
 * a card, and is what the URL's `role` param can hold.
 */
type Role = FlowRole | "COMPANY";

/** Every value the schema's `UserRole` can hold. ADMIN has no portal here. */
type SessionRole = Role | "ADMIN";

/**
 * Human-readable label for a resolvable portal, used in the mismatch messaging.
 *
 * Deliberately *not* `ROLE_LABELS` from `@/lib/auth-flow`: that map is
 * title-case ("Client", "Driver") for the context chip and covers only the two
 * card roles, whereas these are lowercase because they appear mid-sentence and
 * have to include COMPANY, which is a resolved portal rather than a card.
 */
const PORTAL_LABELS: Record<Role, string> = {
  CLIENT: "client",
  DRIVER: "driver",
  COMPANY: "logistics company",
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

/* -------------------------------------------------------------------------- */
/* URL state                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The screens this route serves, in wizard order. `role` and `type` are derived
 * from the query string's `role`/`type`; `forgot` is the one screen that is not
 * a wizard step and so names itself explicitly with `?step=forgot`.
 *
 * There is no `mode` param on this route: the *path* is the mode (`/sign-in` is
 * `"signin"`, `/sign-up` is `"signup"` — see `MODE_PATHS`), so a `mode` in the
 * query string could only ever contradict it. The step-1 toggle therefore
 * navigates between the two paths rather than setting a param.
 */
type Step = "role" | "type" | "credentials" | "forgot";

/** The only `step` value this route recognises. Anything else is ignored. */
const FORGOT_STEP = "forgot";

type FlowLocation = {
  role?: FlowRole | null;
  accountType?: AccountType | null;
  step?: string | null;
};

/**
 * Builds a URL for one of the flow's two paths, carrying whatever the user has
 * already picked. Absent values are omitted rather than emitted empty, so the
 * URL shortens as the user walks back through the wizard and every step has
 * exactly one canonical address.
 */
function flowHref(path: string, { role, accountType, step }: FlowLocation) {
  const query = new URLSearchParams();

  if (role) {
    query.set("role", roleParam(role));
  }
  if (accountType) {
    query.set("type", accountTypeParam(accountType));
  }
  if (step) {
    query.set("step", step);
  }

  const search = query.toString();

  return search ? `${path}?${search}` : path;
}

/**
 * The step-1 card set for a host, as `RoleStep`'s two props.
 *
 * - `"MERCHANT"` — drivers only; the client portal does not exist on that host.
 * - `"CLIENT"` — Client advances in place, Driver is a real cross-origin
 *   navigation to the merchant host, which is the only place a driver session
 *   can exist. `merchantOrigin()` cannot be null here (a "CLIENT" audience means
 *   the split is enabled), but fall back to a same-host relative path rather
 *   than asserting non-null.
 * - `"BOTH"` (split disabled) and `"ADMIN"` — both cards as buttons. ADMIN is
 *   unreachable in practice (middleware redirects `/sign-in` off that host); it
 *   takes the permissive branch only because `Audience` includes it.
 */
function roleCardsForAudience(audience: Audience): {
  roles: readonly FlowRole[];
  hrefs?: Partial<Record<FlowRole, string>>;
} {
  if (audience === "MERCHANT") {
    return { roles: ["DRIVER"] };
  }

  if (audience === "CLIENT") {
    return {
      roles: ["CLIENT", "DRIVER"],
      hrefs: { DRIVER: `${merchantOrigin() ?? ""}/sign-in` },
    };
  }

  return { roles: ["CLIENT", "DRIVER"] };
}

/* -------------------------------------------------------------------------- */
/* Account-type lookup                                                        */
/* -------------------------------------------------------------------------- */

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
  sessionRole: FlowRole,
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

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A form-level failure, shown as the `FormAlert` above the fields (handoff
 * screen 5). The kind decides only how far the styling reaches: a rejected
 * credential also puts the password input into its error state, whereas a
 * portal mismatch is about the *account*, not about what was typed.
 */
type FormError = {
  message: string;
  kind: "credentials" | "portal";
};

type SignInFormProps = {
  /** Audience served by the host this page was requested on. */
  audience: Audience;
  /** Raw `?role=` — unvalidated, straight off the query string. */
  roleQuery: string | null;
  /** Raw `?type=`. */
  accountTypeQuery: string | null;
  /** Raw `?step=`. */
  stepQuery: string | null;
};

/**
 * Sign-in form. Every audience uses the same three-step flow — a portal picker,
 * then an account-type picker, then the credentials form — mirroring the
 * sign-up wizard step for step, so that what a user picked when registering is
 * exactly what they pick when returning. Only the *card list* in step 1 differs
 * (see `roleCardsForAudience`).
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
 *
 * The wizard's position is read from the query string rather than held in
 * state, so back/forward and refresh behave. The query string is user input,
 * which is why every value below is re-derived through the parsers *and*
 * re-checked against this host's card set on every render — a `role` this host
 * does not serve falls back to step 1 rather than rendering a portal the host
 * would never accept a session for.
 */
export function SignInForm({
  audience,
  roleQuery,
  accountTypeQuery,
  stepQuery,
}: SignInFormProps) {
  const router = useRouter();
  const fieldId = React.useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [loading, setLoading] = useState(false);

  /* --- URL → step ------------------------------------------------------- */

  const { roles: cardRoles, hrefs: cardHrefs } = roleCardsForAudience(audience);

  // The roles this host can actually advance to *in page*. A card rendered as a
  // cross-origin link (the Driver card on the client host) is deliberately not
  // in this set: `/sign-in?role=driver` on the client host must fall back to
  // step 1, because a driver session cannot exist on that origin at all.
  const selectableRoles = cardRoles.filter(
    (candidate) => cardHrefs?.[candidate] === undefined,
  );

  const parsedRole = parseRole(roleQuery);
  const role =
    parsedRole !== null && selectableRoles.includes(parsedRole)
      ? parsedRole
      : null;

  const parsedAccountType = parseAccountType(accountTypeQuery);
  // Clients have no Individual Entrepreneur option, so `?role=client&
  // type=individual_entrepreneur` is not a state step 2 could have produced.
  // Falling back to step 2 (rather than silently substituting a type) makes the
  // user answer the question again, which is the only honest recovery.
  const accountType =
    role !== null &&
    parsedAccountType !== null &&
    accountTypeRowsForRole(role).some((row) => row.value === parsedAccountType)
      ? parsedAccountType
      : null;

  const step: Step =
    // Checked first and independently of `role`/`type`: the reset screen asks
    // for an email and nothing else, so it is a valid destination even from a
    // bare `/sign-in?step=forgot` link.
    stepQuery === FORGOT_STEP
      ? "forgot"
      : role === null
        ? "role"
        : accountType === null
          ? "type"
          : "credentials";

  /* --- Errors belong to the screen that produced them -------------------- */

  // Changing step is a navigation, so nothing on screen carries over — least of
  // all an alert about a submit the user has already walked away from. Keying
  // this off the URL-derived step (rather than clearing inside each click
  // handler) is what makes browser back/forward clear it too.
  //
  // Adjusted during render rather than in an effect on purpose: an effect would
  // paint one frame of the previous screen's alert before clearing it. This is
  // React's documented "adjust state when a prop changes" pattern.
  const stepKey = `${step}:${role ?? ""}:${accountType ?? ""}`;
  const [renderedStepKey, setRenderedStepKey] = useState(stepKey);
  if (stepKey !== renderedStepKey) {
    setRenderedStepKey(stepKey);
    setFormError(null);
    setEmailError(null);
    setPasswordError(null);
  }

  /* --- Navigation ------------------------------------------------------- */

  function goTo(location: FlowLocation) {
    router.push(flowHref(MODE_PATHS.signin, location));
  }

  function handleModeChange(nextMode: FlowMode) {
    // This route *is* `"signin"`, so the toggle only has somewhere to go when
    // it moves off it. Crucially the role and type ride along rather than being
    // dropped: switching mode must not skip step 2 — both modes run
    // role → type → form.
    if (nextMode === "signin") {
      return;
    }

    router.push(flowHref(MODE_PATHS[nextMode], { role, accountType }));
  }

  /* --- Sign in ---------------------------------------------------------- */

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
      const actualRoleLabel = PORTAL_LABELS[actualRole];
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
    const actualRoleLabel = PORTAL_LABELS[actualRole];
    return `This account is registered as a ${actualRoleLabel}. Please use the ${actualRoleLabel} sign-in.`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form only renders in step 3, which is reached by way of steps 1 and
    // 2, so both `role` and `accountType` are always set here. These guards
    // narrow the nullable state and are a defensive no-op in practice.
    if (!role) return;
    if (!accountType) return;

    // Client-side shape checks first, so an obvious typo costs no round trip.
    // The server is still the authority on both fields.
    const trimmedEmail = email.trim();
    const nextEmailError =
      trimmedEmail.length === 0
        ? "Enter your email address."
        : isValidEmail(trimmedEmail)
          ? null
          : "Enter a valid email address.";
    const nextPasswordError =
      password.length === 0 ? "Enter your password." : null;

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);

    if (nextEmailError !== null || nextPasswordError !== null) {
      return;
    }

    setLoading(true);

    const { error: signInError } = await signIn.email({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setLoading(false);
      // Better Auth's own message is the alert's title — it is the only thing
      // here that reflects what actually happened (a rejected credential, a
      // suspended account, a rate limit). The handoff's mock adds a second line
      // ("Two attempts left before we pause sign-in for 15 minutes."); it is
      // not rendered, because nothing reports that number: `src/lib/auth.ts`
      // configures no `rateLimit` block, and `src/lib/rate-limit.ts` is wired
      // only to the pricing and geocoding routes. Inventing a countdown that
      // does not match the server's behaviour is worse than showing none.
      setFormError({
        kind: "credentials",
        message: signInError.message ?? "Invalid email or password.",
      });
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
      setFormError({ kind: "portal", message: mismatchMessage(actualRole) });
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
      setFormError({
        kind: "portal",
        message: `This account is registered as ${storedLabel}. Please use the ${storedLabel} sign-in.`,
      });
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

  /* --- Screen 6: forgot password ---------------------------------------- */

  if (step === "forgot") {
    return (
      <AuthShell maxWidth="420" className="gap-6">
        <BackLink
          label="← Back to sign in"
          onClick={() => goTo({ role, accountType })}
        />

        <div className="flex flex-col gap-2.5">
          <AuthHeading>Reset your password</AuthHeading>
          <AuthSubheading>
            Enter the email on your account. We send a link that stays valid for
            30 minutes.
          </AuthSubheading>
        </div>

        {/*
          `onSubmit` exists only to swallow the implicit submission a single
          text input still triggers on Enter — there is nothing to send. See the
          note under the button for why.
        */}
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-reset-email`}>Email</Label>
            {/* Shares the sign-in email state, so arriving here from a failed
                attempt carries the address across instead of asking twice. */}
            <Input
              id={`${fieldId}-reset-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.ge"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={`${fieldId}-reset-note`}
              className="h-11 text-base"
            />
          </div>

          {/*
            Disabled, and says why: `src/lib/auth.ts` configures no
            `sendResetPassword`, so `requestPasswordReset` has nothing to
            deliver the link with — it would succeed silently and no mail would
            arrive. Same pattern as `SocialBlock`: the note is visible, and
            `aria-describedby` gives a screen reader the reason a disabled
            control announces its state but not its cause.
          */}
          <Button
            type="submit"
            disabled
            title="Password reset is not available yet."
            aria-describedby={`${fieldId}-reset-note`}
            className="h-11 w-full text-base"
          >
            Send reset link
          </Button>

          <p
            id={`${fieldId}-reset-note`}
            className="text-[13px] leading-[1.5] text-[var(--landing-muted)]"
          >
            Password reset is not available yet — contact support and we will
            reset it for you.
          </p>

          <p className="text-[13px] leading-[1.5] text-[var(--landing-muted)]">
            Back-office accounts reset through your administrator, not this
            form.
          </p>
        </form>
      </AuthShell>
    );
  }

  /* --- Screen 1: role --------------------------------------------------- */

  if (step === "role") {
    return (
      <AuthShell maxWidth="860">
        <RoleStep
          mode="signin"
          onModeChange={handleModeChange}
          onSelectRole={(nextRole) => goTo({ role: nextRole })}
          roles={cardRoles}
          hrefs={cardHrefs}
        />
      </AuthShell>
    );
  }

  /* --- Screen 2: account type ------------------------------------------- */

  // `role` is non-null on both remaining branches — `step` is only ever "type"
  // or "credentials" once it is — but the compiler cannot see that through the
  // ternary chain above, so narrow it once here.
  if (role === null) {
    return null;
  }

  if (step === "type") {
    return (
      <AuthShell maxWidth="560">
        <AccountTypeStep
          role={role}
          value={accountType}
          onSelect={(nextType) => goTo({ role, accountType: nextType })}
          onBack={() => goTo({})}
        />
      </AuthShell>
    );
  }

  /* --- Screens 3 and 5: credentials ------------------------------------- */

  // Same narrowing as `role` above.
  if (accountType === null) {
    return null;
  }

  const emailErrorId = `${fieldId}-email-error`;
  const passwordErrorId = `${fieldId}-password-error`;
  const phoneNoteId = `${fieldId}-phone-note`;
  const formErrorId = `${fieldId}-form-error`;

  // A rejected credential puts the password field into the handoff's error
  // styling (screen 5); a portal mismatch does not, because nothing about what
  // was typed is wrong in that case — the account simply belongs elsewhere.
  const passwordRejected = formError?.kind === "credentials";
  const passwordInvalid = passwordError !== null || passwordRejected;

  // What the password field points `aria-describedby` at. The field-level error
  // and the form-level alert are not alternatives — a rejected credential can be
  // showing while the user re-empties the field — so both ids are listed when
  // both are on screen, rather than one replacing the other. The alert is only
  // referenced when it is the credential kind: a portal mismatch is about the
  // account, not about what was typed, and does not mark the field invalid.
  const passwordDescribedBy =
    [
      passwordError ? passwordErrorId : null,
      passwordRejected ? formErrorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <AuthShell maxWidth="420" className="gap-6">
      <BackLink onClick={() => goTo({ role })} />

      <div className="flex flex-col gap-2.5">
        <ContextChip role={role} accountType={accountType} />
        <AuthHeading>Sign in</AuthHeading>
      </div>

      {/*
        The handoff defaults this to `phone`, but the phone tab cannot complete
        a sign-in: `src/lib/auth.ts` registers neither the `phoneNumber` nor the
        `emailOTP` plugin, so there is no endpoint to send a code from. Email is
        the default until one lands, at which point `defaultValue` becomes
        "phone" and the disabled state below comes off.
      */}
      {/* `gap-0` cancels the DS root's own 8px gap, so the 20px the handoff
          specifies between the tab strip and its panel is the `pt-5` below and
          nothing else. */}
      <Tabs defaultValue="email" className="w-full gap-0">
        <TabsList className="w-full">
          <TabsTrigger value="phone" className="flex-1">
            Phone
          </TabsTrigger>
          <TabsTrigger value="email" className="flex-1">
            Email
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phone">
          <div className="flex flex-col gap-4 pt-5">
            {/*
              Rendered exactly as designed, disabled rather than removed: the
              tab is part of the shipped design and the plugin is the only thing
              missing, so hiding it would misrepresent the roadmap while a live
              button would dead-end. No fake success path, and nothing navigates
              to an OTP screen that has no code to verify.
            */}
            <PhoneField
              id={`${fieldId}-phone`}
              value=""
              onChange={() => {}}
              disabled
              helper="We text a 6-digit code. No password needed."
              // Same `aria-describedby` note the Send code button carries, so
              // the field itself also names the reason it is greyed out rather
              // than leaving its helper text describing a flow that cannot run.
              describedBy={phoneNoteId}
            />

            <Button
              type="button"
              disabled
              title="Code sign-in is not available yet."
              aria-describedby={phoneNoteId}
              className="h-11 w-full text-base"
            >
              Send code
            </Button>

            <p
              id={phoneNoteId}
              className="text-[13px] leading-[1.5] text-[var(--landing-muted)]"
            >
              Code sign-in is not available yet — use the Email tab to sign in
              with your password.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="email">
          {/*
            `noValidate` so the browser's own validation bubble does not fire
            ahead of the `FieldError` messages below, which are the ones the
            handoff specifies. The `required` attributes stay: they are what
            tells assistive tech the fields are mandatory.
          */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-4 pt-5"
          >
            {formError ? (
              <FormAlert id={formErrorId} title={formError.message} />
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-email`}>Email</Label>
              <Input
                id={`${fieldId}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@company.ge"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(null);
                }}
                aria-invalid={emailError !== null ? true : undefined}
                aria-describedby={emailError ? emailErrorId : undefined}
                className={cn(
                  "h-11 text-base",
                  emailError && ERROR_INPUT_CLASS,
                )}
              />
              {emailError ? (
                <FieldError id={emailErrorId}>{emailError}</FieldError>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={`${fieldId}-password`}>Password</Label>
                {/*
                  Becomes "Reset it" in the error red while an alert is up, per
                  the handoff's screen 5 — the same control, re-pointed at what
                  the user most likely needs next.
                */}
                <button
                  type="button"
                  onClick={() => goTo({ role, accountType, step: FORGOT_STEP })}
                  className={cn(
                    "text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]",
                    formError
                      ? "font-medium text-[#c3341a]"
                      : "text-[var(--landing-muted)] hover:text-[var(--landing-accent)]",
                  )}
                >
                  {formError ? "Reset it" : "Forgot password?"}
                </button>
              </div>

              <Input
                id={`${fieldId}-password`}
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordError(null);
                }}
                aria-invalid={passwordInvalid ? true : undefined}
                aria-describedby={passwordDescribedBy}
                className={cn(
                  "h-11 text-base",
                  passwordInvalid && ERROR_INPUT_CLASS,
                )}
              />
              {passwordError ? (
                <FieldError id={passwordErrorId}>{passwordError}</FieldError>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full text-base"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <SocialBlock />

      {/*
        The handoff's screen 5 also offers "Signed up with a phone number
        instead? Use a code". It is not shipped: the only place it could lead is
        the phone tab, which cannot sign anyone in yet.
      */}
      <p className="text-sm text-[var(--landing-muted)]">
        New to Lalamove?{" "}
        <InlineLinkButton
          href={flowHref(MODE_PATHS.signup, { role, accountType })}
        >
          Create an account
        </InlineLinkButton>
      </p>
    </AuthShell>
  );
}
