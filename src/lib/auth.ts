import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/prisma";

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
