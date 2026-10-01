import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { phoneNumber } from "better-auth/plugins";
import { expo } from "@better-auth/expo";

import {
  ADMIN_TRUSTED_ORIGINS,
  audienceForHost,
  IS_HOST_SPLIT_ENABLED,
  MERCHANT_TRUSTED_ORIGINS,
} from "@/lib/host";
import {
  assertOtpDeliveryConfigured,
  BLOCKED_PHONE_PLUGIN_PATHS,
  enforcePhoneOtpLimits,
  hasPhoneIdentityField,
  isPhonePlaceholderEmail,
  parsePhoneAuthBody,
  PHONE_ACCOUNT_NOT_FOUND_MESSAGE,
  PHONE_ACCOUNT_NOT_FOUND_MESSAGE_KEY,
  PHONE_AUTH_ERROR,
  PHONE_AUTH_RATE_LIMIT_RULES,
  PHONE_SEND_OTP_PATH,
  PHONE_VERIFY_PATH,
  phoneAccountNotFound,
  phoneNumberCannotBeSet,
  phoneNumberCannotBeUpdated,
  phoneNumberPluginOptions,
  resolvePhoneAuthIntent,
} from "@/lib/phone-auth";
import { prisma } from "@/lib/prisma";

/**
 * A sign-up refusal in the requester's language. These messages reach the
 * sign-up form verbatim, so they are localised from the request's
 * `NEXT_LOCALE` cookie (or Referer) via `resolveLocaleFromHeaders`.
 *
 * Only the message text changes — every refusal still throws the same
 * `APIError` with the same status. Both i18n modules are loaded lazily and the
 * lookup is guarded, because this module is also imported by seed scripts that
 * run outside Next, where there is no request config to translate with; there,
 * and whenever `request` is absent, the English original is returned as-is.
 */
async function localizedSignUpRefusal(
  request: Request | undefined,
  key: string,
  english: string,
): Promise<string> {
  if (!request) {
    return english;
  }

  try {
    const [{ getTranslations }, { resolveLocaleFromHeaders }] =
      await Promise.all([
        import("next-intl/server"),
        import("@/i18n/request-locale"),
      ]);
    const t = await getTranslations({
      locale: resolveLocaleFromHeaders(request.headers),
      namespace: "auth.auth",
    });

    return t(key);
  } catch {
    return english;
  }
}

/**
 * Origins trusted to make authenticated requests, beyond `BETTER_AUTH_URL`
 * itself (which Better Auth trusts implicitly). This Vercel project serves
 * the same deployment from several stable aliases — the production domain,
 * the org/project default domain, and the git-branch domain for `main` —
 * and Better Auth otherwise rejects every request whose `Origin` isn't
 * exactly `BETTER_AUTH_URL` with a 403 `INVALID_ORIGIN`, which is why
 * sign-in/sign-up broke on aliases other than the one `BETTER_AUTH_URL`
 * happened to be set to.
 *
 * `MERCHANT_TRUSTED_ORIGINS` and `ADMIN_TRUSTED_ORIGINS` (from `@/lib/host`)
 * are appended for exactly the same reason: under their respective host splits
 * the merchant and admin subdomains are distinct origins, so without them
 * every `POST /api/auth/*` issued from those hosts would be rejected with
 * `INVALID_ORIGIN` — which for the admin host would mean staff could never
 * sign in. Each is an empty array while its own split is disabled, making the
 * spread a no-op.
 *
 * The last entry is a wildcard rather than another fixed alias: every
 * `vercel deploy` preview gets its own unique `<name>-<hash>-<team>.vercel.app`
 * URL, so listing them individually can never keep up. Better Auth's
 * `trustedOrigins` matcher (`matchesOriginPattern`) supports glob patterns for
 * exactly this — `*` here stands for the per-deployment hash, scoped to this
 * Vercel team's own domain suffix rather than every `*.vercel.app`, so this
 * doesn't trust other teams' deployments.
 */
const TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "https://template-blush-pi.vercel.app",
  "https://lalamove-app-sandrosss13s-projects.vercel.app",
  "https://lalamove-app-git-main-sandrosss13s-projects.vercel.app",
  "https://lalamove-app-sandrosss13-sandrosss13s-projects.vercel.app",
  "https://*-sandrosss13s-projects.vercel.app",
];

/**
 * The native driver app's deep-link scheme (`scheme` in its Expo `app.json`).
 *
 * A React Native client has no web origin: `@better-auth/expo`'s client sends
 * its scheme in an `expo-origin` header, and the server plugin copies that into
 * `Origin` when the request carries none. Better Auth then runs its ordinary
 * origin check against this list, so the scheme must be trusted here or every
 * `POST /api/auth/*` from the app is refused with `INVALID_ORIGIN` — the same
 * failure the aliases in `TRUSTED_ORIGINS` exist to prevent for browsers.
 *
 * A browser always sends its own `Origin` on a cross-origin or `POST` request
 * and cannot set it from script, so trusting this scheme admits no web page.
 */
const DRIVER_APP_TRUSTED_ORIGINS = ["driverapp://"];

/**
 * Expo Go / dev-client origins, trusted in development only.
 *
 * While the app runs inside Expo Go its deep links are `exp://<lan-ip>:<port>`
 * rather than `driverapp://`. Any Expo Go project on the network shares that
 * scheme, so it is never trusted outside `NODE_ENV === "development"`. The
 * `expo()` plugin adds the same entry under the same condition; it is spelled
 * out here as well so the rule is visible beside the rest of the list and does
 * not silently depend on a plugin default.
 */
const EXPO_DEV_TRUSTED_ORIGINS =
  process.env.NODE_ENV === "development" ? ["exp://"] : [];

/**
 * The host half of the sign-up rules: which role may be created from which
 * hostname. Shared by every endpoint that can create an account — email
 * sign-up and phone verification — so neither can mint what the other refuses.
 *
 * No-ops when `request` is absent: company-driven driver registration
 * (`src/app/api/logistics-company/drivers/register/route.ts`) calls
 * `auth.api.signUpEmail` directly without forwarding the incoming request's
 * headers — deliberately, so creating a driver doesn't clobber the admin's own
 * session — and would otherwise always be rejected.
 *
 * `code` is attached to the refusal when given; email sign-up passes none, so
 * its error body is unchanged.
 */
async function assertRoleMayBeCreatedFromHost(
  request: Request | undefined,
  role: string,
  code?: string,
): Promise<void> {
  if (!request) {
    return;
  }

  // `x-forwarded-host` is what a proxy (Vercel) sets to the hostname the
  // browser actually asked for; `host` is the direct-connection case
  // (local dev). `audienceForHost` only ever matches this against the
  // exact configured merchant/admin hosts, so a spoofed value can at worst
  // classify the request as CLIENT — the more restrictive side.
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const audience = audienceForHost(host);

  // The admin host serves the back office only; it has no sign-up page and
  // must never mint an account of any role. Checked outside the host-split
  // bail-out below because the admin split is independent of the merchant
  // one — it can be enabled while `NEXT_PUBLIC_MERCHANT_HOST` is unset.
  if (audience === "ADMIN") {
    throw new APIError("FORBIDDEN", {
      message: await localizedSignUpRefusal(
        request,
        "accountsCannotBeCreatedFromThe",
        "Accounts cannot be created from the admin host.",
      ),
      ...(code ? { code } : {}),
    });
  }

  if (!IS_HOST_SPLIT_ENABLED) {
    return;
  }

  if (audience === "CLIENT" && role !== "CLIENT") {
    throw new APIError("FORBIDDEN", {
      message: await localizedSignUpRefusal(
        request,
        "driverAndLogisticsCompanyAccountsMust",
        "Driver and logistics company accounts must be created from the merchant sign-up page.",
      ),
      ...(code ? { code } : {}),
    });
  }

  if (audience === "MERCHANT" && role === "CLIENT") {
    throw new APIError("FORBIDDEN", {
      message: await localizedSignUpRefusal(
        request,
        "clientAccountsMustBeCreatedFrom",
        "Client accounts must be created from the main sign-up page.",
      ),
      ...(code ? { code } : {}),
    });
  }
}

/** Better Auth's built-in "update my own profile" endpoint. */
const UPDATE_USER_PATH = "/update-user";

/** The only role an account created by phone verification may hold. */
const PHONE_SIGN_UP_ROLE = "DRIVER";

/** Better Auth's built-in "change my own password" endpoint. */
const CHANGE_PASSWORD_PATH = "/change-password";

/** Better Auth's built-in email/password sign-up endpoint (`signUpEmail`). */
const SIGN_UP_EMAIL_PATH = "/sign-up/email";

/**
 * Better Auth's built-in session-read endpoint (`getSession`).
 *
 * Every server component and route handler in this app reads its session
 * through `auth.api.getSession(...)`, and `auth.api.*` dispatches through the
 * same hook pipeline as an HTTP request to `/api/auth/get-session` does. That
 * is what makes one `after` hook on this path a gate the whole application
 * passes through, rather than a check each of the ~80 route handlers has to
 * remember to make.
 */
const GET_SESSION_PATH = "/get-session";

/**
 * What a suspended account is told when it tries to sign in.
 *
 * Deliberately does *not* echo `User.suspendedReason`. That column holds a note
 * staff wrote for staff — the human-readable half of the audit entry — and
 * moderation notes are not written in the expectation that the moderated user
 * will read them. Support is the channel for the specifics.
 */
const SUSPENDED_ACCOUNT_MESSAGE =
  "This account has been suspended. Please contact support.";

/**
 * Machine-readable counterpart to the message above, returned as the error
 * `code` so a caller can branch on the reason without matching on prose. Named
 * after the domain's own word ("suspended") rather than Better Auth's admin
 * plugin's ("BANNED_USER"), since this app has no admin plugin and no `banned`
 * column — see the `databaseHooks` comment below.
 */
const SUSPENDED_ACCOUNT_CODE = "ACCOUNT_SUSPENDED";

/**
 * Better Auth server instance.
 *
 * `secret` and `baseURL` are intentionally omitted — they are read from the
 * `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` environment variables.
 *
 * The `role` additional field mirrors the `UserRole` Prisma enum. It is marked
 * `input: true` so a client can set it explicitly at sign-up (CLIENT, DRIVER, or
 * COMPANY); the Prisma column carries a default of CLIENT as a safety net. The
 * enum's fourth member, ADMIN, is explicitly *not* settable this way — the
 * sign-up hook below rejects it outright.
 *
 * `mustChangePassword` backs the forced-password-reset flow for drivers whose
 * account was created for them by a company admin with a temporary password.
 * Better Auth has no native primitive for this, so it lives as a plain column
 * surfaced on the session user. It is `input: false`: only trusted server code
 * (the driver-registration route, via a direct Prisma write) ever sets it to
 * `true`, never a client-supplied sign-up or update payload.
 *
 * `isSuspended` mirrors the moderation column the back office writes. It is
 * declared here for one reason: Better Auth's `parseUserOutput` strips every
 * column that isn't part of its own schema or an `additionalField`, so without
 * this entry the session user would arrive with no suspension status on it and
 * the `/get-session` hook below would have to issue a second query per session
 * read — on a field that changes roughly never. `input: false` for the same
 * reason as `mustChangePassword`, and more sharply: this one is a lockout, so
 * a client-supplied sign-up or `update-user` payload must never be able to
 * clear it.
 *
 * `advanced.crossSubDomainCookies` must never be enabled here. The
 * merchant/client host split (see `@/lib/host`) depends on the two hostnames
 * having completely separate sessions — sharing the session cookie across
 * subdomains would mean signing in on one host silently authenticates you on
 * the other, which defeats the entire point of the split.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: [
    ...TRUSTED_ORIGINS,
    ...MERCHANT_TRUSTED_ORIGINS,
    ...ADMIN_TRUSTED_ORIGINS,
    ...DRIVER_APP_TRUSTED_ORIGINS,
    ...EXPO_DEV_TRUSTED_ORIGINS,
  ],
  /**
   * `expo()` is what lets the React Native driver app use the same
   * cookie-session endpoints the browser does. Its two hooks change nothing
   * for a browser: `onRequest` only acts when a request has **no** `Origin`
   * header and does carry `expo-origin` (a browser always sends `Origin` on the
   * state-changing requests the origin check applies to), and `after` only
   * rewrites redirects to a non-http(s) scheme on OAuth / magic-link /
   * verify-email callbacks, none of which this app enables. Sessions stay
   * cookie-based — the native client stores the `Set-Cookie` value in secure
   * storage and replays it as a `Cookie` header.
   *
   * It is **not** inert for a browser, though: it also registers an
   * unauthenticated `GET /api/auth/expo-authorization-proxy` that redirects to
   * any https URL in its `authorizationURL` query parameter and sets a
   * caller-chosen `oauth_state` cookie — an open redirect. That endpoint only
   * serves social-provider OAuth, which this app does not enable, so the
   * catch-all route answers 404 for it before Better Auth is reached (see
   * `@/lib/mobile-api/blocked-auth-paths`). Revisit that block if social login
   * is ever enabled.
   */
  /**
   * `phoneNumber()` is the driver app's sign-in: a mobile number and a
   * six-digit SMS code. An unknown number gets an account only when the app
   * declares the `sign-up` intent (see `databaseHooks.user.create`). Its options
   * and the checks in front of its endpoints live in `@/lib/phone-auth`; the
   * `hooks.before` below is where those checks run.
   */
  plugins: [expo(), phoneNumber(phoneNumberPluginOptions)],
  /**
   * Better Auth's own per-IP limiter is on in production only (its default)
   * and keeps its counters in memory; these rules just tighten the two phone
   * endpoints within it. See `enforcePhoneOtpLimits` for the honest caveat.
   */
  rateLimit: {
    customRules: PHONE_AUTH_RATE_LIMIT_RULES,
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        input: true,
        defaultValue: "CLIENT",
      },
      mustChangePassword: {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: false,
      },
      isSuspended: {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        /**
         * Three rules for an account that is born with a phone number — which
         * is what the phone plugin's verify endpoint creates for an unknown
         * number, and what nothing else may create.
         *
         * 0. Only the verify endpoint. A number on a new account is a sign-in
         *    credential, so it must have been proven. `hooks.before` already
         *    refuses it in an email sign-up body; this is the backstop for any
         *    other route to user creation, present or future.
         *
         * 1. Only "Sign up" creates accounts. The driver app has separate
         *    "Sign in" and "Sign up" entries and declares which one it is in
         *    the `x-phone-auth-intent` header; unless that says `sign-up`, the
         *    creation is refused with `PHONE_ACCOUNT_NOT_FOUND` and no row is
         *    written.
         *
         *    It is enforced *here*, not in `hooks.before`, because this is the
         *    only point between the plugin checking the code and the plugin
         *    writing the user. That ordering is the security property: a caller
         *    who cannot receive the SMS only ever sees `INVALID_OTP`, whatever
         *    the number, so the refusal cannot be used to probe which numbers
         *    are registered. By now the plugin has also consumed the code, so
         *    it cannot be replayed with `sign-up` — the driver requests a new
         *    one, exactly as after any other finished verification.
         *
         *    Both rules fail closed: a creation that somehow arrived without
         *    its endpoint context is refused rather than waved through.
         *
         * 2. Backstop for the role rule: the verify endpoint builds the new
         *    user from the request body. The `hooks.before` below already
         *    forces the role; this holds even if a future change lets a body
         *    reach the plugin without passing through it.
         */
        before: async (user, context) => {
          const candidate = user as {
            phoneNumber?: unknown;
            phoneNumberVerified?: unknown;
            role?: unknown;
          };

          if (candidate.phoneNumber || candidate.phoneNumberVerified) {
            if (context?.path !== PHONE_VERIFY_PATH) {
              throw phoneNumberCannotBeSet();
            }

            const request = context.request;
            const intent = resolvePhoneAuthIntent(
              request?.headers ?? context.headers,
            );

            if (intent !== "sign-up") {
              throw phoneAccountNotFound(
                await localizedSignUpRefusal(
                  request,
                  PHONE_ACCOUNT_NOT_FOUND_MESSAGE_KEY,
                  PHONE_ACCOUNT_NOT_FOUND_MESSAGE,
                ),
              );
            }
          }

          if (candidate.phoneNumber && candidate.role !== PHONE_SIGN_UP_ROLE) {
            return { data: { ...user, role: PHONE_SIGN_UP_ROLE } };
          }

          return undefined;
        },
      },
      update: {
        /**
         * The same rule for an existing account: its sign-in number, and
         * whether that number counts as verified, change only when the verify
         * endpoint has just checked a code for it. `hooks.before` refuses both
         * keys on `/update-user`; this covers every other Better Auth write to
         * the user row. Trusted server code that writes through Prisma does
         * not pass through here, and none of it touches these columns.
         */
        before: async (data, context) => {
          if (
            hasPhoneIdentityField(data) &&
            context?.path !== PHONE_VERIFY_PATH
          ) {
            throw phoneNumberCannotBeUpdated();
          }
        },
      },
    },
    session: {
      create: {
        /**
         * The lock on the front door: a suspended account may not obtain a
         * session, by any route.
         *
         * This is deliberately a `databaseHooks.session.create.before` rather
         * than a `hooks.before` on `/sign-in/email`. Every way of acquiring a
         * session — email/password today, any social provider or plugin
         * endpoint added later, and direct server-side `auth.api.*` calls —
         * funnels through session creation, so this one hook covers the set
         * rather than the one endpoint that exists right now. It is also the
         * exact mechanism Better Auth's own admin plugin uses for its `banned`
         * column, which is the closest thing upstream has to this feature.
         *
         * That plugin is not adopted here on purpose. Taking it would mean
         * adding its `banned`/`banReason`/`banExpires` columns alongside the
         * `isSuspended`/`suspendedAt`/`suspendedReason` ones the back office
         * already writes, and adopting its own `role` semantics on top of this
         * app's `UserRole` enum — two parallel notions of "blocked" and two of
         * "role". Reusing its *pattern* against this app's existing columns is
         * the cheaper half of that trade, and is what this hook does.
         *
         * Throwing an `APIError` (rather than returning `false`, which the
         * hook API also accepts) is what turns the refusal into a 403 carrying
         * a message the sign-in form can show; returning `false` aborts the
         * write but leaves the caller with a generic failure.
         */
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isSuspended: true },
          });

          if (user?.isSuspended) {
            throw new APIError("FORBIDDEN", {
              message: SUSPENDED_ACCOUNT_MESSAGE,
              code: SUSPENDED_ACCOUNT_CODE,
            });
          }
        },
      },
    },
  },
  hooks: {
    /**
     * One `before` middleware for every endpoint, self-filtering on `ctx.path`:
     * the phone plugin's unused endpoints (404), `/update-user` (no role or
     * phone-number changes), the two phone sign-in endpoints (see
     * `@/lib/phone-auth`), and email sign-up, described next.
     *
     * Two guards on public sign-up, in order of how absolute they are.
     *
     * 1. No account may ever self-grant `role: "ADMIN"`. `role` is
     *    `input: true` on the `User` additionalField, so `POST
     *    /api/auth/sign-up/email` accepts whatever role the body carries —
     *    which, with `UserRole.ADMIN` now in the enum, would otherwise let
     *    anyone hand-roll themselves a back-office account. Internal staff
     *    accounts are created only by a `SUPER_ADMIN` through a trusted
     *    server-side call, never through this endpoint. Checked before every
     *    other condition (including the `ctx.request` bail-out below) so it
     *    holds for direct server-side `auth.api.signUpEmail` calls too, and
     *    regardless of either host split's state.
     *
     * 2. Server-side backstop for the merchant/client host split: reject a
     *    sign-up whose role doesn't belong on the requesting host. The
     *    client-side form already only offers the role-appropriate options per
     *    host, but the same `input: true` looseness means a hand-rolled
     *    request could otherwise still create a DRIVER account from the client
     *    host. The admin host is folded in here as "no account of any role",
     *    since it hosts no sign-up surface at all.
     *
     * (2) must no-op when `ctx.request` is absent: company-driven driver
     * registration (`src/app/api/logistics-company/drivers/register/route.ts`)
     * calls `auth.api.signUpEmail` directly without forwarding the incoming
     * request's headers — deliberately, so creating a driver doesn't clobber
     * the admin's own session — which means `ctx.request` is `undefined` for
     * that call. Without this bail-out, every company-created driver
     * registration would be rejected.
     */
    before: createAuthMiddleware(async (ctx) => {
      // The phone plugin's password-based endpoints have no screen in any
      // client; they do not exist as far as a caller can tell.
      if (BLOCKED_PHONE_PLUGIN_PATHS.includes(ctx.path)) {
        throw new APIError("NOT_FOUND");
      }

      if (
        ctx.path === UPDATE_USER_PATH &&
        typeof ctx.body === "object" &&
        ctx.body !== null
      ) {
        // `role` is `input: true` so that sign-up can carry it, and Better
        // Auth applies the same flag to `/update-user` — which, unguarded, let
        // any signed-in account rewrite its own role, `ADMIN` included. No
        // screen changes a role this way; roles are fixed at sign-up and
        // changed only by trusted server code writing through Prisma.
        if ("role" in ctx.body) {
          throw new APIError("FORBIDDEN", {
            message: "Role cannot be updated.",
            code: "ROLE_CANNOT_BE_UPDATED",
          });
        }

        // A sign-in number is only ever set by verifying it. The plugin
        // already refuses to *change* one here; this also refuses clearing
        // it, which would strand a phone-only account with no way back in and
        // free its number for a stranger to register — and refuses the
        // `phoneNumberVerified` flag alongside it.
        if (hasPhoneIdentityField(ctx.body)) {
          throw phoneNumberCannotBeUpdated();
        }
      }

      if (ctx.path === PHONE_SEND_OTP_PATH || ctx.path === PHONE_VERIFY_PATH) {
        // Fail closed first: with no way to deliver a code, nothing below is
        // worth doing and nothing may be accepted.
        assertOtpDeliveryConfigured();

        const { phoneNumber: phone, code } = parsePhoneAuthBody(
          ctx.path,
          ctx.body,
        );

        enforcePhoneOtpLimits(ctx.path, phone, ctx.request);

        // Verification signs an existing account in and — under the `sign-up`
        // intent — creates a missing one, so the sign-up rules apply exactly
        // when the number is unknown. The intent is deliberately not consulted
        // here: refusing a sign-in for an unknown number before the code has
        // been checked would tell anyone which numbers are registered. They
        // are applied to the send as well, so a host that could never complete
        // the sign-up does not spend an SMS finding that out.
        const existing = await prisma.user.findUnique({
          where: { phoneNumber: phone },
          select: { id: true },
        });

        if (!existing) {
          await assertRoleMayBeCreatedFromHost(
            ctx.request,
            PHONE_SIGN_UP_ROLE,
            PHONE_AUTH_ERROR.SIGN_UP_HOST_NOT_ALLOWED,
          );
        }

        // The plugin keys the stored code and the user lookup on the exact
        // string in the body, so it is handed the normalised number. `role` is
        // forced because the plugin passes extra body keys to user creation;
        // the two flags are pinned off for the reasons in `parsePhoneAuthBody`.
        return {
          context: {
            body:
              code === null
                ? { phoneNumber: phone }
                : {
                    phoneNumber: phone,
                    code,
                    role: PHONE_SIGN_UP_ROLE,
                    disableSession: false,
                    updatePhoneNumber: false,
                  },
          },
        };
      }

      if (ctx.path !== SIGN_UP_EMAIL_PATH) {
        return undefined;
      }

      // An email account must not be born holding a phone number: the phone
      // plugin signs a verified number in to whichever account carries it, so
      // this would let anyone plant a password account on a stranger's number
      // and wait for them to sign in to it. Checked before everything else so
      // it holds for server-side `auth.api.signUpEmail` calls too.
      if (hasPhoneIdentityField(ctx.body)) {
        throw phoneNumberCannotBeSet();
      }

      const role =
        (ctx.body as { role?: string } | undefined)?.role ?? "CLIENT";

      if (role === "ADMIN") {
        throw new APIError("FORBIDDEN", {
          message: await localizedSignUpRefusal(
            ctx.request,
            "adminAccountsCannotBeCreatedThrough",
            "Admin accounts cannot be created through sign-up.",
          ),
        });
      }

      // A phone account's placeholder address is derived from its number, so
      // letting email sign-up claim one would lock that number's owner out.
      if (isPhonePlaceholderEmail((ctx.body as { email?: unknown })?.email)) {
        throw new APIError("BAD_REQUEST", {
          message: "This email address cannot be used.",
        });
      }

      await assertRoleMayBeCreatedFromHost(ctx.request, role);

      // Spelled out because the phone branch above returns a value.
      return undefined;
    }),

    /**
     * Better Auth takes a single `after` middleware, not a list, so both
     * post-endpoint behaviours live in this one function and self-filter on
     * `ctx.path`.
     *
     * 1. `/get-session` — refuse to hand back a session belonging to a
     *    suspended account, and destroy it on the way out.
     * 2. `/change-password` — clear `mustChangePassword` once the user has
     *    actually picked a new password.
     *
     * `ctx.context.returned` holds whatever the endpoint produced. Better Auth
     * catches a thrown `APIError` (e.g. a wrong current password) and stores
     * the error object there rather than rethrowing before hooks run, so a
     * failed attempt is only distinguishable by inspecting it — without the
     * `isAPIError` check below a driver could clear the flag by submitting the
     * form incorrectly.
     */
    after: createAuthMiddleware(async (ctx) => {
      /**
       * The lock on the inside of the door, complementing the session-creation
       * hook above: a session issued *before* the suspension is worthless from
       * the next request onward.
       *
       * `POST /api/admin/users/[userId]/suspend` already revokes the target's
       * sessions outright, and that — not this — is what makes suspension take
       * effect in the same second an admin clicks the button. This hook exists
       * because that route is not the only way the column can become `true`: a
       * data fix, a future bulk-moderation job, or a second admin surface would
       * each otherwise leave live sessions behind. The flag is authoritative
       * here, whoever set it.
       *
       * The check is free: `isSuspended` rides on the session user because it
       * is declared as an `additionalField` above, so this reads a value the
       * endpoint had already loaded rather than issuing a query of its own on
       * a path the whole application takes on every request.
       *
       * Returning `ctx.json(null)` replaces the endpoint's response, which is
       * exactly what a caller of `auth.api.getSession(...)` receives — so all
       * ~80 route handlers and server components see a signed-out user without
       * any of them being edited. Deleting the row and the cookie as well means
       * the stale token cannot be replayed and the browser stops sending it.
       */
      if (ctx.path === GET_SESSION_PATH) {
        // A signed-out request, an expired session and an `APIError` all
        // produce something without a suspended `user` on it, so the one check
        // covers every shape this endpoint can return.
        const returned = ctx.context.returned as {
          session?: { token?: string };
          user?: { isSuspended?: boolean };
        } | null;

        if (returned?.user?.isSuspended) {
          const token = returned.session?.token;
          if (token) {
            await ctx.context.internalAdapter.deleteSession(token);
          }

          deleteSessionCookie(ctx);

          return ctx.json(null);
        }
      }

      if (
        ctx.path === CHANGE_PASSWORD_PATH &&
        !isAPIError(ctx.context.returned)
      ) {
        // `/change-password` runs behind a session middleware, so a successful
        // call always has one; the guard is for the type, not for reachability.
        const session = ctx.context.session;
        if (session) {
          await prisma.user.update({
            where: { id: session.user.id },
            data: { mustChangePassword: false },
          });
        }
      }

      // Every other path, and every non-suspended session read, leaves the
      // endpoint's own response untouched. Spelled out rather than falling off
      // the end because the branch above returns a value.
      return undefined;
    }),
  },
});
