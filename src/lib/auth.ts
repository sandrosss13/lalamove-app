import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

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

/**
 * Better Auth server instance.
 *
 * `secret` and `baseURL` are intentionally omitted — they are read from the
 * `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` environment variables.
 *
 * The `role` additional field mirrors the `UserRole` Prisma enum. It is marked
 * `input: true` so a client can set it explicitly at sign-up (CLIENT, DRIVER, or
 * COMPANY); the Prisma column carries a default of CLIENT as a safety net.
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
    },
  },
});
