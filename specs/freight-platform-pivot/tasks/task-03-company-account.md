# Task 03: Logistics company role, sign-up & profile API

## Status

pending

## Wave

2

## Description

Introduces `LogisticsCompany` as a signable-up account type: a company creates its own login (role
`COMPANY`, same Better Auth email/password mechanism as clients and drivers already use), then
completes a company profile (name, VAT id, phone, city) the same way client/driver sign-up already
has a two-step "create the auth user, then POST the role-specific profile" flow. This task only
covers getting a company account into existence and readable/writable via its own profile API — the
fleet/roster/dashboard UI that uses this account is task-04/task-06.

## Dependencies

**Depends on:** task-01-schema-and-seed.md
**Blocks:** task-06-account-dashboards.md

**Context from dependencies:** task-01 added `UserRole.COMPANY` and the `LogisticsCompany` model
(`userId` unique FK to `User`, `companyName`, `vatId`, `phone` unique, `city: GeorgianCity`, plus
`drivers`/`vehicles`/`orders` relations that later tasks populate — this task doesn't need to touch
those relations, just create/read the company's own row).

## Files to Modify

- `src/lib/auth.ts` — the `role` additional field's Better Auth config (`input: true`, mirrors
  `UserRole`) needs no logic change (Better Auth just persists whatever string the client sends for
  a field already configured as free-form-but-typed) — but double check there isn't a hardcoded
  allow-list anywhere in this file limiting it to `CLIENT`/`DRIVER` and widen it if so. Also check
  `src/app/api/auth/[...all]/route.ts` for the same reason (it's a catch-all, unlikely to need
  changes, but confirm).
- `src/app/sign-up/page.tsx` — currently a 3-step client form: pick role (`CLIENT`/`DRIVER`) → pick
  account type → fill profile fields → `signUp.email(...)` then `POST` to `/api/client-profile` or
  `/api/driver-profile`. Add `COMPANY` as a third role option in step 1. A company has no "account
  type" sub-choice (unlike client/driver's Individual/Business/etc.) — skip step 2 for `COMPANY` and
  go straight to its profile fields: company name, VAT id, phone, city (reuse the existing
  `GEORGIAN_CITY_OPTIONS` constant already in this file). On submit, follow the same pattern as the
  existing driver/client branches: `signUp.email({ email, password, name, role: "COMPANY" })` then
  `POST /api/logistics-company` with the profile body, surfacing `payload?.error` on failure exactly
  like the existing branches do.

## Files to Create

- `src/app/api/logistics-company/route.ts` — `GET`/`POST`, mirroring the exact structure of
  `src/app/api/driver-profile/route.ts` (hand-rolled `parseCreateLogisticsCompanyBody`, session
  check, `role !== "COMPANY"` → `403`, `prisma.logisticsCompany.upsert` keyed on `userId`). Required
  fields: `companyName` (non-empty string), `vatId` (non-empty string), `phone` (non-empty string),
  `city` (must be a valid `GeorgianCity`). Handle a duplicate `phone` the same way
  `src/app/api/client-profile/route.ts` handles duplicate phone: catch the Prisma `P2002` on the
  `phone` unique constraint and return `409` with `"This phone number is already registered to another account."`
  instead of a raw `500` — copy that file's `isDuplicatePhoneError`-style helper pattern, adapted to
  `LogisticsCompany`.

## Technical Details

### `POST /api/logistics-company` request/response

Request: `{ companyName: string, vatId: string, phone: string, city: GeorgianCity }`.
Response (201): the created/updated `LogisticsCompany` row.
Errors: `401` unauthenticated, `403` non-`COMPANY` role, `400` validation (mirror the exact error
message style of `src/app/api/driver-profile/route.ts`, e.g.
`"companyName is required and must be a non-empty string."`), `409` duplicate phone.

### `GET /api/logistics-company`

Same auth/role checks as `GET /api/client-profile`: `401` unauthenticated, `403` non-`COMPANY`,
otherwise return the signed-in company's `LogisticsCompany` row or `null` if they haven't completed
their profile yet (a valid state, not an error — matches the existing `client-profile`/
`driver-profile` `GET` convention exactly).

### Sign-up form changes

In `src/app/sign-up/page.tsx`, the role picker (step 1) currently renders two options
(`CLIENT`/`DRIVER`) — add a third, `COMPANY`, labeled something like "Logistics Company". Since a
company has no account-type sub-step, when `role === "COMPANY"` is selected, skip directly to a
profile-fields step (reuse whatever the file's existing step-transition pattern is — check how it
currently moves from step 1 to step 2 to step 3 for `CLIENT`/`DRIVER` and adapt minimally, don't
restructure the whole component's state machine beyond what's needed to add this branch). Fields for
the company step: Company name (text, required), VAT ID (text, required), Phone (tel, required),
City (`<select>` from `GEORGIAN_CITY_OPTIONS`, required). On submit, same two-call pattern as
existing branches:
```ts
const { error: signUpError } = await signUp.email({ email, password, name, role: "COMPANY" });
// ...existing error handling...
const response = await fetch("/api/logistics-company", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ companyName, vatId, phone, city }),
});
// ...existing error handling, surfacing payload?.error...
```

## Acceptance Criteria

- [ ] A new user can sign up choosing "Logistics Company" as their role, fill in company name/VAT/
      phone/city, and land with a `COMPANY`-role session and a persisted `LogisticsCompany` row.
- [ ] `GET /api/logistics-company` returns `null` for a `COMPANY` session with no profile yet, the
      row once created, `401` signed out, `403` for a non-`COMPANY` session.
- [ ] `POST /api/logistics-company` validates all required fields with clear per-field error
      messages, returns `409` on a duplicate phone (verified live: sign up two companies with the
      same phone, second attempt gets `409` not `500`).
- [ ] `pnpm lint`/`pnpm typecheck` pass for every file this task touches.
- [ ] Verified live against the dev server: full sign-up flow for a `COMPANY` account works
      end-to-end (create the account, confirm the profile persists via `GET`), then the test account
      is cleaned up (deleted) afterward — same pattern prior work in this repo has followed.

## Notes

- Do not build the company dashboard UI (fleet list, driver roster, order claiming) — that's
  task-06/task-07. This task's scope ends at "a company can sign up and its profile is
  readable/writable via API."
- Do not touch `src/app/api/driver-profile/route.ts` or `src/app/api/client-profile/route.ts` — copy
  their pattern, don't modify them.
