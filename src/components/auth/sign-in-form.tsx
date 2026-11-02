"use client";

import * as React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { AccountTypeStep } from "@/components/auth/account-type-step";
import {
  AuthHeading,
  AuthSubheading,
  BackLink,
  ContextChip,
  DANGER_TEXT_CLASS,
  ERROR_INPUT_CLASS,
  FieldError,
  FormAlert,
  InlineLinkButton,
  PhoneField,
  SocialBlock,
  useAccountTypeLabels,
} from "@/components/auth/auth-primitives";
import { AuthShell } from "@/components/auth/auth-shell";
import { RoleStep } from "@/components/auth/role-step";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChooseMethodHint,
  PhoneCodeStep,
  useResendCooldown,
} from "@/components/auth/phone-code-step";
import {
  defaultAuthMethod,
  parseAuthMethod,
  resolvePortalRole,
  type AuthMethod,
  type PhoneAuthFailure,
  type PhoneAuthRecovery,
  type PortalRole,
} from "@/components/auth/phone-auth-flow";
import {
  sendPhoneCode,
  verifyPhoneCode,
} from "@/components/auth/phone-otp-client";
import {
  checkSignedInPortal,
  type SessionRole,
} from "@/components/auth/portal-check";
import type { AccountType } from "@/lib/account-types";
import {
  accountTypeParam,
  accountTypeRowsForRole,
  isValidEmail,
  isValidGeorgianPhone,
  MODE_PATHS,
  parseAccountType,
  parseRole,
  phoneDigits,
  roleParam,
  type FlowMode,
  type FlowRole,
} from "@/lib/auth-flow";
import { signIn } from "@/lib/auth-client";
import { normalizePhoneNumber } from "@/lib/phone-number";
import { merchantOrigin, type Audience } from "@/lib/host";
import {
  appendGoodsParam,
  postAuthDestination,
} from "@/lib/goods-param-threading";
import type { GoodsShortcutCode } from "@/lib/goods-shortcuts";
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
type Role = PortalRole;

/**
 * Human-readable label for a resolvable portal, used in the mismatch messaging.
 *
 * Deliberately *not* `ROLE_LABELS` from `@/lib/auth-flow`: that map is
 * title-case ("Client", "Driver") for the context chip and covers only the two
 * card roles, whereas these are lowercase because they appear mid-sentence and
 * have to include COMPANY, which is a resolved portal rather than a card.
 */
const PORTAL_LABEL_KEYS = {
  CLIENT: "portalClient",
  DRIVER: "portalDriver",
  COMPANY: "portalCompany",
} as const satisfies Record<Role, string>;

/**
 * Where to send a successfully signed-in **client**. Providers — drivers and
 * logistics companies — never consult this table: `/` is the client landing
 * page and neither of them has anything there, so both go straight to
 * `/dashboard` whatever the host (see the end of `handleSubmit`).
 *
 * The merchant host must NOT push `"/"` — that path is client-only, so the
 * middleware would immediately bounce the user back to the client host, where
 * their merchant session does not exist and they would land signed out.
 *
 * Keyed by audience only: for the one role that still reads it, the destination
 * depends on which host the user is on, not on which of that host's portals
 * they picked.
 *
 * A landing-page goods shortcut is appended to the CLIENT destination at the
 * point of use (`postAuthDestination`), never stored in this table: `/` is the
 * only destination that reads `?goods=`, and only a validated code is added.
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
  /**
   * The landing page's goods shortcut. Not a wizard position — it is carried
   * unchanged across every hop, including the toggle to `/sign-up`, so the
   * booking form opens on it once the visitor is signed in.
   */
  goods?: GoodsShortcutCode | null;
};

/**
 * Builds a URL for one of the flow's two paths, carrying whatever the user has
 * already picked. Absent values are omitted rather than emitted empty, so the
 * URL shortens as the user walks back through the wizard and every step has
 * exactly one canonical address.
 */
function flowHref(
  path: string,
  { role, accountType, step, goods }: FlowLocation,
) {
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
  // Re-validated inside: only an exact shortcut code is ever appended.
  appendGoodsParam(query, goods);

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

/**
 * The phone tab's form-level failure. Separate from `FormError` because the
 * two tabs are two forms, and an alert about a code must not appear over the
 * password field (or survive a switch back to it). `recovery` decides which
 * link, if any, rides inside the alert — see `PhoneAuthRecovery`.
 */
type PhoneFormError = {
  message: string;
  recovery: PhoneAuthRecovery;
};

/** The phone tab's two screens: type the number, then type the code. */
type PhoneStage = "number" | "code";

type SignInFormProps = {
  /** Audience served by the host this page was requested on. */
  audience: Audience;
  /** Raw `?role=` — unvalidated, straight off the query string. */
  roleQuery: string | null;
  /** Raw `?type=`. */
  accountTypeQuery: string | null;
  /** Raw `?step=`. */
  stepQuery: string | null;
  /**
   * `?goods=`, already narrowed to an exact shortcut code by the page — the
   * one query value that leaves this flow, so it is validated at the trust
   * boundary rather than here.
   */
  goods: GoodsShortcutCode | null;
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
 * Two ways in, one gate: the Email tab (`signIn.email`) and the Phone tab (an
 * SMS code through Better Auth's phone plugin) both end in `completeSignIn`,
 * which runs the role and account-type checks in `./portal-check` *after* the
 * session exists — checking beforehand would require an email/number → role
 * lookup, which is an account enumeration oracle. A rejected account is signed
 * straight back out, and `src/lib/auth.ts` enforces the same boundary
 * server-side as a backstop. Which tab opens first depends on the account type
 * (`defaultAuthMethod`).
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
  goods,
}: SignInFormProps) {
  const t = useTranslations("auth.signInForm");
  const tPhone = useTranslations("auth.phoneAuth");
  const tShared = useTranslations("common.shared");
  const accountTypeLabels = useAccountTypeLabels();
  const router = useRouter();
  const fieldId = React.useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [loading, setLoading] = useState(false);

  /* --- Phone tab state --------------------------------------------------- */

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneStage, setPhoneStage] = useState<PhoneStage>("number");
  /** The E.164 number the current code was sent to. */
  const [sentPhone, setSentPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [phoneFormError, setPhoneFormError] = useState<PhoneFormError | null>(
    null,
  );
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useResendCooldown();

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
  //
  // The opening tab is reset alongside, for the same reason and by the same
  // pattern: it depends on the account type, and stepping back to step 2 and
  // picking another type keeps this component mounted — a `useState`
  // initialiser alone would keep the first type's default.
  const stepKey = `${step}:${role ?? ""}:${accountType ?? ""}`;
  const defaultMethod =
    role !== null && accountType !== null
      ? defaultAuthMethod(role, accountType)
      : null;
  const [method, setMethod] = useState<AuthMethod | null>(defaultMethod);
  const [renderedStepKey, setRenderedStepKey] = useState(stepKey);
  if (stepKey !== renderedStepKey) {
    setRenderedStepKey(stepKey);
    setFormError(null);
    setEmailError(null);
    setPasswordError(null);
    setMethod(defaultMethod);
    setPhoneStage("number");
    setPhoneError(null);
    setCode("");
    setCodeError(null);
    setPhoneFormError(null);
  }

  /* --- Navigation ------------------------------------------------------- */

  function goTo(location: FlowLocation) {
    router.push(flowHref(MODE_PATHS.signin, { ...location, goods }));
  }

  function handleModeChange(nextMode: FlowMode) {
    // This route *is* `"signin"`, so the toggle only has somewhere to go when
    // it moves off it. Crucially the role and type ride along rather than being
    // dropped: switching mode must not skip step 2 — both modes run
    // role → type → form.
    if (nextMode === "signin") {
      return;
    }

    router.push(flowHref(MODE_PATHS[nextMode], { role, accountType, goods }));
  }

  /* --- Sign in ---------------------------------------------------------- */

  /** Message shown when the account's real role isn't the one that was picked. */
  function mismatchMessage(actualRole: SessionRole): string {
    // ADMIN has no card on this form and no portal to point at — the back office
    // is served from its own host, which middleware redirects `/sign-in` off.
    if (actualRole === "ADMIN") {
      return t("cannotSignInHere");
    }

    if (audience === "CLIENT" && actualRole !== "CLIENT") {
      return t("registeredAsMerchant", {
        role: t(PORTAL_LABEL_KEYS[actualRole]),
      });
    }

    if (audience === "MERCHANT" && actualRole === "CLIENT") {
      return t("customerAccount");
    }

    // Same-host mismatch: picked the wrong portal on a host that serves it.
    // The merchant host reaches this line too, now that the Driver card leads
    // to two portals — a company that picked Individual is told to use the
    // logistics company sign-in, and a driver that picked Business is told to
    // use the driver one.
    return t("registeredAsUsePortal", {
      role: t(PORTAL_LABEL_KEYS[actualRole]),
    });
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
        ? t("enterYourEmailAddress")
        : isValidEmail(trimmedEmail)
          ? null
          : t("enterAValidEmailAddress");
    const nextPasswordError =
      password.length === 0 ? t("enterYourPassword") : null;

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
        message: signInError.message ?? t("invalidEmailOrPassword"),
      });
      return;
    }

    // Sign-in succeeded and a session now exists; the shared gate decides
    // whether it may stay.
    const rejection = await completeSignIn(role, accountType);

    if (rejection !== null) {
      setLoading(false);
      setFormError({ kind: "portal", message: rejection });
    }
  }

  /**
   * The one exit from both tabs once a session exists: the portal checks
   * (`checkSignedInPortal`, which signs a rejected session back out itself),
   * then the redirect. Returns the message to show when the account belongs
   * somewhere else, or `null` after navigating away.
   */
  async function completeSignIn(
    pickedRole: FlowRole,
    pickedAccountType: AccountType,
  ): Promise<string | null> {
    const portal = resolvePortalRole(pickedRole, pickedAccountType);
    const check = await checkSignedInPortal(
      portal,
      pickedRole,
      pickedAccountType,
    );

    if (!check.ok) {
      return check.reason === "role"
        ? mismatchMessage(check.actualRole)
        : t("registeredAsType", {
            type: accountTypeLabels[check.storedAccountType],
          });
    }

    // Both provider roles land on `/dashboard` whatever the host: `/` is the
    // client landing page and neither a driver nor a company has anything
    // there. Routing them through `/` first is what used to make `/` flash a
    // dead-end "you're signed in as a driver" screen before bouncing them on,
    // so the bounce is removed at the source and only a CLIENT still consults
    // the per-audience table.
    //
    // Where a company goes from `/dashboard` — the onboarding wizard, the
    // application status screen or the ops dashboard — is decided there, from
    // the application row this form has not read, so nothing further is pushed
    // here.
    //
    // A client who arrived with a landing-page goods shortcut lands on
    // `/?goods=<code>`; `postAuthDestination` decorates `/` only, with a
    // validated code only.
    router.push(
      postAuthDestination(
        portal === "DRIVER" || portal === "COMPANY"
          ? "/dashboard"
          : POST_SIGN_IN_PATH[audience],
        goods,
      ),
    );
    router.refresh();
    return null;
  }

  /* --- Sign in by phone -------------------------------------------------- */

  /**
   * Routes a phone refusal to where it belongs on screen: under the number,
   * under the code, or in the alert (with its recovery link). A spent code is
   * also cleared, so the input is ready for the next one.
   */
  function showPhoneFailure(failure: PhoneAuthFailure) {
    const message = tPhone(failure.messageKey);

    if (failure.recovery === "resend") {
      setCode("");
    }

    if (failure.target === "phone") {
      setPhoneError(message);
    } else if (failure.target === "code") {
      setCodeError(message);
    } else {
      setPhoneFormError({ message, recovery: failure.recovery });
    }
  }

  /**
   * Step one of the phone tab. The number is checked here first — the same
   * nine-digits-after-+995 rule the sign-up form applies — then normalised to
   * the E.164 form the plugin keys everything on.
   *
   * The role header is the portal steps 1 and 2 resolved to. For a number that
   * has an account it changes nothing (an existing number signs in whatever
   * its role, and `completeSignIn` then judges the portal); it is sent always
   * because the server reads it for unknown numbers.
   */
  async function handleSendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || !accountType) return;

    setPhoneFormError(null);
    const digits = phoneDigits(phone);

    if (!isValidGeorgianPhone(digits)) {
      setPhoneError(tPhone("enterPhoneDigits"));
      return;
    }

    // Nine digits that are not a Georgian *mobile* number (a landline, say)
    // pass the shape check but cannot receive an SMS.
    const phoneNumber = normalizePhoneNumber(digits);
    if (phoneNumber === null) {
      setPhoneError(tPhone("errorInvalidPhone"));
      return;
    }

    setPhoneError(null);
    setPhoneLoading(true);
    const result = await sendPhoneCode(
      phoneNumber,
      resolvePortalRole(role, accountType),
    );
    setPhoneLoading(false);

    if (!result.ok) {
      showPhoneFailure(result);
      return;
    }

    setSentPhone(phoneNumber);
    setCode("");
    setCodeError(null);
    setPhoneStage("code");
    cooldown.start();
  }

  /** "Resend code", once the cooldown allows it. Same number, same headers. */
  async function handleResend() {
    if (!role || !accountType) return;

    setPhoneFormError(null);
    setCodeError(null);
    setResending(true);
    const result = await sendPhoneCode(
      sentPhone,
      resolvePortalRole(role, accountType),
    );
    setResending(false);

    if (!result.ok) {
      showPhoneFailure(result);
      return;
    }

    setCode("");
    cooldown.start();
  }

  /**
   * Step two: verify with the sign-in intent, so an unknown number is refused
   * (`PHONE_ACCOUNT_NOT_FOUND`, with a link to sign up) rather than handed a
   * new, empty account. On success the session exists and the shared gate
   * takes over.
   */
  async function handleVerify(enteredCode: string) {
    if (!role || !accountType) return;

    setPhoneFormError(null);
    setCodeError(null);
    setPhoneLoading(true);

    const result = await verifyPhoneCode(
      sentPhone,
      enteredCode,
      "sign-in",
      resolvePortalRole(role, accountType),
    );

    if (!result.ok) {
      setPhoneLoading(false);
      showPhoneFailure(result);
      // A refusal that spends the code for good outside the code's own
      // lifetime — no account for the number — has nothing left to type on
      // this screen; the alert and its link belong over the number.
      if (result.recovery === "signUp") {
        setPhoneStage("number");
      }
      return;
    }

    const rejection = await completeSignIn(role, accountType);

    if (rejection !== null) {
      // The session is already gone and the code with it, so the code screen
      // has nothing left to offer; the alert goes over the number instead.
      setPhoneLoading(false);
      setPhoneStage("number");
      setCode("");
      setPhoneFormError({ message: rejection, recovery: "none" });
    }
  }

  /* --- Screen 6: forgot password ---------------------------------------- */

  if (step === "forgot") {
    return (
      <AuthShell maxWidth="420" className="gap-6">
        <BackLink
          label={t("backToSignIn")}
          onClick={() => goTo({ role, accountType })}
        />

        <div className="flex flex-col gap-2.5">
          <AuthHeading>{t("resetYourPassword")}</AuthHeading>
          <AuthSubheading>{t("enterTheEmailOnYourAccount")}</AuthSubheading>
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
            <Label htmlFor={`${fieldId}-reset-email`}>{tShared("email")}</Label>
            {/* Shares the sign-in email state, so arriving here from a failed
                attempt carries the address across instead of asking twice. */}
            <Input
              id={`${fieldId}-reset-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={tShared("youCompanyGe")}
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
            title={t("passwordResetIsNotAvailableYet2")}
            aria-describedby={`${fieldId}-reset-note`}
            className="h-11 w-full text-base"
          >
            {t("sendResetLink")}
          </Button>

          <p
            id={`${fieldId}-reset-note`}
            className="text-[13px] leading-[1.5] text-[var(--landing-muted)]"
          >
            {t("passwordResetIsNotAvailableYet")}
          </p>

          <p className="text-[13px] leading-[1.5] text-[var(--landing-muted)]">
            {t("backOfficeAccountsResetThroughYour")}
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
  const formErrorId = `${fieldId}-form-error`;
  const phoneFormErrorId = `${fieldId}-phone-form-error`;
  const methodHintId = `${fieldId}-method-hint`;

  // The phone tab's alert, shared by its two screens. The recovery link sits
  // inside the alert it answers, so "no account for this number" and "sign up
  // instead" are read as one thing.
  const phoneAlert = phoneFormError ? (
    <FormAlert id={phoneFormErrorId} title={phoneFormError.message}>
      {phoneFormError.recovery === "signUp" ? (
        <InlineLinkButton
          href={flowHref(MODE_PATHS.signup, { role, accountType, goods })}
        >
          {tPhone("signUpWithThisNumber")}
        </InlineLinkButton>
      ) : phoneFormError.recovery === "driverSite" ? (
        // Unreachable on sign-in in practice — the sign-in intent never
        // creates an account, so the host check never fires — but the
        // mapping is shared with sign-up and costs nothing to honour.
        <InlineLinkButton href={`${merchantOrigin() ?? ""}/sign-up`} external>
          {tPhone("goToDriverSite")}
        </InlineLinkButton>
      ) : null}
    </FormAlert>
  ) : null;

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
        <AuthHeading>{tShared("signIn")}</AuthHeading>
      </div>

      {/* `gap-0` cancels the DS root's own 8px gap, so the 20px the handoff
          specifies between the tab strip and its panel is the `pt-5` below and
          nothing else.

          Controlled, because the opening tab is the account type's default
          (`defaultAuthMethod`) and must follow a change of type without a
          remount. An individual client gets no default: `value` is then "",
          which matches neither trigger, so the strip renders with nothing
          selected and nothing beneath it but the hint — the owner's neutral
          choice. `activationMode="manual"` keeps it neutral for keyboard users
          too: with automatic activation, merely tabbing into the strip would
          focus — and so select — Phone. */}
      <Tabs
        value={method ?? ""}
        onValueChange={(value) => {
          const next = parseAuthMethod(value);
          if (next !== null) setMethod(next);
        }}
        activationMode="manual"
        className="w-full gap-0"
      >
        <TabsList
          className="w-full"
          aria-describedby={method === null ? methodHintId : undefined}
        >
          <TabsTrigger value="phone" className="flex-1">
            {tShared("phone")}
          </TabsTrigger>
          <TabsTrigger value="email" className="flex-1">
            {tShared("email")}
          </TabsTrigger>
        </TabsList>

        {method === null ? (
          <ChooseMethodHint
            id={methodHintId}
            text={tPhone("chooseSignInMethod")}
          />
        ) : null}

        <TabsContent value="phone">
          <div className="pt-5">
            {phoneStage === "code" ? (
              <PhoneCodeStep
                id={`${fieldId}-otp`}
                phoneNumber={sentPhone}
                code={code}
                onCodeChange={(next) => {
                  setCode(next);
                  setCodeError(null);
                }}
                codeError={codeError}
                alert={phoneAlert}
                onVerify={handleVerify}
                onResend={handleResend}
                onChangeNumber={() => {
                  setPhoneStage("number");
                  setCode("");
                  setCodeError(null);
                  setPhoneFormError(null);
                }}
                verifying={phoneLoading}
                resending={resending}
                resendSecondsLeft={cooldown.secondsLeft}
                submitLabel={tPhone("verifyAndSignIn")}
              />
            ) : (
              <form
                onSubmit={handleSendCode}
                noValidate
                className="flex flex-col gap-4"
              >
                {phoneAlert}

                <PhoneField
                  id={`${fieldId}-phone`}
                  value={phone}
                  onChange={(value) => {
                    setPhone(value);
                    setPhoneError(null);
                  }}
                  helper={t("weTextACode")}
                  error={phoneError ?? undefined}
                  required
                />

                <Button
                  type="submit"
                  disabled={phoneLoading}
                  className="h-11 w-full text-base"
                >
                  {phoneLoading ? tPhone("sendingCode") : t("sendCode")}
                </Button>
              </form>
            )}
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
              <Label htmlFor={`${fieldId}-email`}>{tShared("email")}</Label>
              <Input
                id={`${fieldId}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder={tShared("youCompanyGe")}
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
              <Label htmlFor={`${fieldId}-password`}>
                {tShared("password")}
              </Label>

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

              {/*
                Sits below the input, right-aligned to the field's trailing
                edge: it is the action offered *after* a password has been
                tried, not a label for the box, and the field's own error stays
                next to the field it describes, above this.

                Becomes "Reset it" in the error red while an alert is up, per
                the handoff's screen 5 — the same control, re-pointed at what
                the user most likely needs next.
              */}
              <button
                type="button"
                onClick={() => goTo({ role, accountType, step: FORGOT_STEP })}
                className={cn(
                  "self-end text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]",
                  formError
                    ? cn("font-medium", DANGER_TEXT_CLASS)
                    : "text-[var(--landing-muted)] hover:text-[var(--landing-accent)]",
                )}
              >
                {formError ? t("resetIt") : t("forgotPassword")}
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full text-base"
            >
              {loading ? t("signingIn") : tShared("signIn")}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <SocialBlock />

      {/* The handoff's screen 5: after a rejected password, offer the phone
          tab to someone who may have registered with a number instead. */}
      {method === "email" && formError?.kind === "credentials" ? (
        <p className="text-sm text-[var(--landing-muted)]">
          {tPhone("signedUpWithPhone")}{" "}
          <InlineLinkButton onClick={() => setMethod("phone")}>
            {tPhone("useACode")}
          </InlineLinkButton>
        </p>
      ) : null}

      <p className="text-sm text-[var(--landing-muted)]">
        {t("newToZomo")}{" "}
        <InlineLinkButton
          href={flowHref(MODE_PATHS.signup, { role, accountType, goods })}
        >
          {t("createAnAccount")}
        </InlineLinkButton>
      </p>
    </AuthShell>
  );
}
