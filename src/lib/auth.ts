import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";

import {
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
 * `MERCHANT_TRUSTED_ORIGINS` (from `@/lib/host`) is appended for exactly the
 * same reason: under the merchant/client host split the merchant subdomain is
 * a distinct origin, so without it every `POST /api/auth/*` issued from the
 * merchant host would be rejected with `INVALID_ORIGIN`. It is an empty array
 * while the split is disabled, making the spread a no-op.
 */
const TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "https://template-blush-pi.vercel.app",
  "https://lalamove-app-sandrosss13s-projects.vercel.app",
  "https://lalamove-app-git-main-sandrosss13s-projects.vercel.app",
  "https://lalamove-app-sandrosss13-sandrosss13s-projects.vercel.app",
];

/** Better Auth's built-in "change my own password" endpoint. */
const CHANGE_PASSWORD_PATH = "/change-password";

/** Better Auth's built-in email/password sign-up endpoint (`signUpEmail`). */
const SIGN_UP_EMAIL_PATH = "/sign-up/email";

/**
 * Better Auth server instance.
 *
 * `secret` and `baseURL` are intentionally omitted — they are read from the
 * `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` environment variables.
 *
 * The `role` additional field mirrors the `UserRole` Prisma enum. It is marked
 * `input: true` so a client can set it explicitly at sign-up (CLIENT, DRIVER, or
 * COMPANY); the Prisma column carries a default of CLIENT as a safety net.
 *
 * `mustChangePassword` backs the forced-password-reset flow for drivers whose
 * account was created for them by a company admin with a temporary password.
 * Better Auth has no native primitive for this, so it lives as a plain column
 * surfaced on the session user. It is `input: false`: only trusted server code
 * (the driver-registration route, via a direct Prisma write) ever sets it to
 * `true`, never a client-supplied sign-up or update payload.
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
  trustedOrigins: [...TRUSTED_ORIGINS, ...MERCHANT_TRUSTED_ORIGINS],
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
    },
  },
  hooks: {
    /**
     * Server-side backstop for the merchant/client host split: reject a
     * sign-up whose role doesn't belong on the requesting host. The
     * client-side form already only offers the role-appropriate options per
     * host, but `role` is `input: true` on the `User` additionalField, so a
     * hand-rolled `POST /api/auth/sign-up/email` could otherwise still create
     * a DRIVER account from the client host.
     *
     * Must no-op when `ctx.request` is absent: company-driven driver
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

      if (!IS_HOST_SPLIT_ENABLED) {
        return;
      }

      if (!ctx.request) {
        return;
      }

      // `x-forwarded-host` is what a proxy (Vercel) sets to the hostname the
      // browser actually asked for; `host` is the direct-connection case
      // (local dev). `audienceForHost` only ever matches this against the
      // exact configured merchant host, so a spoofed value can at worst
      // classify the request as CLIENT — the more restrictive side.
      const host =
        ctx.request.headers.get("x-forwarded-host") ??
        ctx.request.headers.get("host");
      const audience = audienceForHost(host);
      const role =
        (ctx.body as { role?: string } | undefined)?.role ?? "CLIENT";

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
     * Clear `mustChangePassword` once the user has actually picked a new
     * password. This runs for every endpoint, so it self-filters on the path.
     *
     * `ctx.context.returned` holds whatever the endpoint produced. Better Auth
     * catches a thrown `APIError` (e.g. a wrong current password) and stores
     * the error object there rather than rethrowing before hooks run, so a
     * failed attempt is only distinguishable by inspecting it — without this
     * check a driver could clear the flag by submitting the form incorrectly.
     */
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== CHANGE_PASSWORD_PATH) {
        return;
      }

      if (isAPIError(ctx.context.returned)) {
        return;
      }

      // `/change-password` runs behind a session middleware, so a successful
      // call always has one; the guard is for the type, not for reachability.
      const session = ctx.context.session;
      if (!session) {
        return;
      }

      await prisma.user.update({
        where: { id: session.user.id },
        data: { mustChangePassword: false },
      });
    }),
  },
});
