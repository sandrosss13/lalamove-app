# Task 02: Better Auth Config — Expose `mustChangePassword` and Clear It on Change

## Status

pending

## Wave

2

## Description

The `mustChangePassword` column added in task-01 needs to be visible on the Better Auth session/user object (so both server code and the client can read it) and needs to be cleared automatically when a driver successfully changes their password through Better Auth's own `changePassword` endpoint. This task wires both into `src/lib/auth.ts`. It deliberately does **not** set `mustChangePassword` to `true` anywhere in this file — that happens via a direct Prisma update inside the driver-registration API route (task-03), scoped to exactly the accounts that need it. A global "set true on every user creation" hook was considered and rejected: it would also fire for ordinary client/company sign-ups, which must never be forced into a password change they didn't ask for.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-04-change-password-page.md

**Context from dependencies:** task-01 adds `User.mustChangePassword Boolean @default(false)` to `prisma/schema.prisma` and runs the migration, so the column already exists in the database and on the generated Prisma client by the time this task runs.

## Files to Modify

- `src/lib/auth.ts` — add the `mustChangePassword` additional field; add an `after` hook that clears it once a password change succeeds.

## Technical Details

### Current file (for reference — only the additions below are new)

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/prisma";

const TRUSTED_ORIGINS = [ /* unchanged, do not touch */ ];

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: TRUSTED_ORIGINS,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: "string", required: true, input: true, defaultValue: "CLIENT" },
    },
  },
});
```

### Implementation Steps

1. Add `mustChangePassword` to `user.additionalFields`, alongside the existing `role` field. Use `input: false` — this field is never set by a client-supplied sign-up/update payload, only by trusted server code (the registration route in task-03, via a direct Prisma write):

   ```ts
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
   ```

2. Import `createAuthMiddleware` from `better-auth/api` at the top of the file:

   ```ts
   import { createAuthMiddleware } from "better-auth/api";
   ```

3. Add a `hooks.after` entry that matches Better Auth's change-password endpoint and, on success, clears the flag for the session's user:

   ```ts
   export const auth = betterAuth({
     database: prismaAdapter(prisma, { provider: "postgresql" }),
     trustedOrigins: TRUSTED_ORIGINS,
     emailAndPassword: { enabled: true },
     user: {
       additionalFields: {
         role: { /* unchanged */ },
         mustChangePassword: { /* as above */ },
       },
     },
     hooks: {
       after: [
         {
           matcher: (ctx) => ctx.path === "/change-password",
           handler: createAuthMiddleware(async (ctx) => {
             const session = ctx.context.session;
             const returned = ctx.context.returned as
               | { error?: unknown }
               | undefined;
             const failed =
               returned !== undefined &&
               typeof returned === "object" &&
               returned !== null &&
               "error" in returned;

             if (session && !failed) {
               await prisma.user.update({
                 where: { id: session.user.id },
                 data: { mustChangePassword: false },
               });
             }
           }),
         },
       ],
     },
   });
   ```

4. Run `pnpm typecheck`. If `ctx.context.session` or `ctx.context.returned` don't match the installed `better-auth` version's hook context type (the exact shape can differ across versions), adjust field access to whatever the type checker reports as correct — the intent (run only after a successful `/change-password` call, read the acting user's id, clear their flag) is what matters, not the exact property path. If this proves non-obvious, consult the `better-auth-expert` agent with the specific type error.

## Acceptance Criteria

- [ ] `session.user.mustChangePassword` is readable (typed as `boolean`) from both `auth.api.getSession(...)` on the server and `authClient.useSession()` on the client, via the existing `inferAdditionalFields<typeof auth>()` plugin already configured in `src/lib/auth-client.ts` (no changes needed there — it re-infers automatically from the server config).
- [ ] After a signed-in user successfully calls `authClient.changePassword({ currentPassword, newPassword })`, their `User.mustChangePassword` row in the database becomes `false` (verify with a manual test once task-04 exists, or with a temporary script/Prisma Studio check).
- [ ] A failed `changePassword` call (wrong current password) does **not** clear the flag.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] No existing sign-up, sign-in, or session-reading code path breaks — `role` additionalField behavior is unchanged.

## Notes

- This task does not create the `/change-password` page or any redirect-based enforcement — that's task-04, which depends on this task for the flag to exist and clear correctly.
- Nothing in this task sets `mustChangePassword: true`. That only happens in the driver-registration route (task-03), and only for the specific `User` row it creates.
