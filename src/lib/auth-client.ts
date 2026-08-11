import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import type { auth } from "@/lib/auth";

/**
 * Better Auth browser client.
 *
 * `baseURL` is omitted because the client runs same-origin against the
 * `/api/auth` route handler. `inferAdditionalFields<typeof auth>()` re-uses the
 * server config's types so the custom `role` field is available (and typed) on
 * the session user and the sign-up payload.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession, changePassword } =
  authClient;
