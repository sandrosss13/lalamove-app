# Action Required: Driver Registration and Vehicle Assignment

No account creation, API keys, or third-party service setup is needed — this feature deliberately adds no email/SMS infrastructure (see `requirements.md` Non-Goals).

One manual verification step is needed because it can't be checked by static review or type-checking:

## During Implementation

- [ ] **Verify `auth.api.signUpEmail` (called server-side in task-03, without forwarding request headers) does not set a session cookie on the calling admin's browser.** This assumption isn't documented Better Auth behavior. To check: as a COMPANY user, open the dashboard, use "Register new driver" to create one, and confirm you're still signed in as the company afterward — no unexpected sign-out or session swap to the new driver's account. Also referenced in `tasks/task-03-driver-register-api.md`'s acceptance criteria.

## After Implementation

- [ ] **Run `pnpm prisma migrate deploy` (or the project's normal migration-deploy step) against the production database** before or during the deploy that ships this feature — `task-01-schema-migration.md` only runs `migrate dev` locally.

---

> These tasks are also referenced in context within the relevant task files.
