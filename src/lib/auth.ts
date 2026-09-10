import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";

import {
  ADMIN_TRUSTED_ORIGINS,
  audienceForHost,
  IS_HOST_SPLIT_ENABLED,
  MERCHANT_TRUSTED_ORIGINS,
} from "@/lib/host";
import { prisma } from "@/lib/prisma";

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
  ],
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
      if (ctx.path !== SIGN_UP_EMAIL_PATH) {
        return;
      }

      const role =
        (ctx.body as { role?: string } | undefined)?.role ?? "CLIENT";

      if (role === "ADMIN") {
        throw new APIError("FORBIDDEN", {
          message: "Admin accounts cannot be created through sign-up.",
        });
      }

      if (!ctx.request) {
        return;
      }

      // `x-forwarded-host` is what a proxy (Vercel) sets to the hostname the
      // browser actually asked for; `host` is the direct-connection case
      // (local dev). `audienceForHost` only ever matches this against the
      // exact configured merchant/admin hosts, so a spoofed value can at worst
      // classify the request as CLIENT — the more restrictive side.
      const host =
        ctx.request.headers.get("x-forwarded-host") ??
        ctx.request.headers.get("host");
      const audience = audienceForHost(host);

      // The admin host serves the back office only; it has no sign-up page and
      // must never mint an account of any role. Checked outside the host-split
      // bail-out below because the admin split is independent of the merchant
      // one — it can be enabled while `NEXT_PUBLIC_MERCHANT_HOST` is unset.
      if (audience === "ADMIN") {
        throw new APIError("FORBIDDEN", {
          message: "Accounts cannot be created from the admin host.",
        });
      }

      if (!IS_HOST_SPLIT_ENABLED) {
        return;
      }

      if (audience === "CLIENT" && role !== "CLIENT") {
        throw new APIError("FORBIDDEN", {
          message:
            "Driver and logistics company accounts must be created from the merchant sign-up page.",
        });
      }

      if (audience === "MERCHANT" && role === "CLIENT") {
        throw new APIError("FORBIDDEN", {
          message:
            "Client accounts must be created from the main sign-up page.",
        });
      }
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
