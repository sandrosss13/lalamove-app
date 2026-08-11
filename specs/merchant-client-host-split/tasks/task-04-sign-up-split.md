# Task 04: Audience-aware sign-up

## Status

complete

## Wave

2

## Description

Splits `/sign-up` into a thin server component (`src/app/sign-up/page.tsx`) that detects the requesting host's audience and a new client component (`src/components/auth/sign-up-form.tsx`) that renders the multi-step registration wizard scoped to that audience: the client host only ever creates CLIENT accounts, the merchant host only ever offers DRIVER or COMPANY registration — and, when the split is disabled, the exact current 3-role wizard is preserved unchanged. Also fixes the same redirect bug task-03 fixes for sign-in: today's unconditional `router.push("/")` after a successful merchant sign-up would bounce a brand-new driver/company account off the merchant host immediately after creating it.

## Dependencies

**Depends on:** task-01-host-detection-and-auth-config.md
**Blocks:** None

**Context from dependencies:** task-01 creates `src/lib/host.ts`, exporting the `Audience` type (`"CLIENT" | "MERCHANT" | "BOTH"`) and `audienceForHost(host): Audience`. `audienceForHost` returns `"BOTH"` whenever the split is disabled (the default state until task-08 sets `NEXT_PUBLIC_MERCHANT_HOST`), so the `"CLIENT"`/`"MERCHANT"` branches below are unreachable until then, and the `"BOTH"` branch — which must exactly reproduce today's page — is what actually runs. task-01 also adds a server-side `hooks.before` guard in `src/lib/auth.ts` that 403s a role/host mismatch at the API layer; this task's client-side audience scoping is the primary UX (only showing valid options), the server-side hook is the backstop for a hand-rolled request bypassing this form entirely — this task does not need to handle that hook's error response specially, the existing generic `signUpError.message` handling already surfaces it.

## Files to Create

- `src/components/auth/sign-up-form.tsx` — the extracted client wizard, taking an `audience: Audience` prop.

## Files to Modify

- `src/app/sign-up/page.tsx` — becomes a server component that reads the request host and renders `<SignUpForm audience={...} />`.

## Technical Details

### Current `src/app/sign-up/page.tsx` (read in full before editing — this is the entire file being replaced)

The current file is a `"use client"` component with this state and flow (read the actual file on disk for full JSX/Tailwind classes — reproduce them exactly, only the step-skipping logic changes):

- State: `email, password, role (Role | null), accountType (AccountType | null), city, firstName, lastName, companyName, vatId, phone, error, loading`.
- `type Role = "CLIENT" | "DRIVER" | "COMPANY"`; `type AccountType = "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "BUSINESS"`.
- **Step 1** (`role === null`): three cards — Client / Driver / Logistics Company — clicking sets `role`.
- **Step 2** (`accountType === null && role !== "COMPANY"`): account-type cards. CLIENT and DRIVER both get Individual + Business; DRIVER additionally gets Individual Entrepreneur. COMPANY has no account-type variants and skips straight to step 3.
- **Step 3**: the identity form — Company name + VAT ID (if `role === "COMPANY" || accountType === "BUSINESS"`) or First name + Surname (otherwise); then Phone, Email, Password (all roles); then City select from `GEORGIAN_CITY_OPTIONS` (imported from `@/lib/georgian-cities`) if `role === "DRIVER" || role === "COMPANY"`.
- On submit: derives `resolvedName` (company name for COMPANY/BUSINESS, else `firstName + lastName`), calls `signUp.email({ name: resolvedName, email, password, role })`, then on success POSTs to `/api/driver-profile`, `/api/client-profile`, or `/api/logistics-company` depending on `role`, with role-appropriate fields. On any failure, sets `error` and stops (does not navigate away — the auth account already exists at that point). On full success: `router.push("/"); router.refresh();`.
- `ROLE_HEADINGS` and `ACCOUNT_TYPE_LABELS` const maps drive the step 2/3 headings.

### New `src/app/sign-up/page.tsx`

```tsx
import { headers } from "next/headers";

import { audienceForHost } from "@/lib/host";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default async function SignUpPage() {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const audience = audienceForHost(host);

  return <SignUpForm audience={audience} />;
}
```

### New `src/components/auth/sign-up-form.tsx`

Move the entire current page body here as `"use client"`, taking `{ audience: Audience }` (`import type { Audience } from "@/lib/host";`). All the existing state, derivation logic (`resolvedName`), and the three follow-up profile `POST` calls are unchanged — only the entry point into the wizard and the post-success redirect change, per audience:

- **`audience === "BOTH"`** (split disabled): unchanged — step 1 shows all three role cards exactly as today, step 2/3 unchanged, on success `router.push("/"); router.refresh();` — unchanged.

- **`audience === "CLIENT"`**: role is fixed to `"CLIENT"` — do not render step 1 at all (no role picker). What is today's "step 2" (account-type picker: Individual / Business) becomes the first screen shown, with its own "← Back" button removed (there's no step 1 to go back to on this host) or, more simply, kept pointed at nothing/disabled — prefer just omitting the Back button on this screen for this audience rather than leaving a dead button. Step 3 (identity form) is unchanged, reached from the account-type screen exactly as today. On success: `router.push("/"); router.refresh();` — unchanged (client host owns `/`).

- **`audience === "MERCHANT"`**: step 1 shows only two cards — Driver and Logistics Company — with the Client card removed entirely. Everything downstream is unchanged: choosing Driver still goes to the 3-way account-type step (Individual / Individual Entrepreneur / Business) then the identity form with a city select; choosing Logistics Company still skips straight to the identity form with a city select. On success: **`router.push("/dashboard"); router.refresh();`** — this is the fix described above; do not push `"/"`, which is client-only and would immediately bounce the newly-created driver/company account off the merchant host via the middleware from task-02.

Preserve every existing Tailwind class and the exact card/label/input/button markup for all three audience branches — only which steps are shown/skipped and the final redirect target change.

## Acceptance Criteria

- [ ] `src/app/sign-up/page.tsx` is a server component using `headers()` + `audienceForHost`, rendering `<SignUpForm audience={...} />`.
- [ ] `src/components/auth/sign-up-form.tsx` implements all three audience branches described above, with the `"BOTH"` branch behaviorally identical to the current page (verify manually with `NEXT_PUBLIC_MERCHANT_HOST` unset: full 3-role wizard, `router.push("/")` on success, all three profile-creation POSTs unchanged).
- [ ] `pnpm lint && pnpm typecheck` pass.

## Notes

Full merchant/client-audience manual verification (client host shows no role picker and only creates CLIENT accounts; merchant host shows exactly two role cards and lands the new account on `/dashboard`) requires `NEXT_PUBLIC_MERCHANT_HOST` to be set — covered by task-08's end-to-end test matrix once all of Wave 2 has landed.
