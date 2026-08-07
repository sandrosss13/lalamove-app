import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, isAPIError } from "better-auth/api";

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
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: TRUSTED_ORIGINS,
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
