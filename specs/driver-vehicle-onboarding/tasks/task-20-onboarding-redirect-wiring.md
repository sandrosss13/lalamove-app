# Task 20: Onboarding Redirect Wiring

## Status

complete

## Wave

7

## Description

The last piece: actually sending an eligible driver into the wizard from `/dashboard` instead of showing them the normal driver dashboard. `task-08`'s `/dashboard/onboarding/page.tsx` already defensively bounces an ineligible visitor *away* from the wizard; this task is the other direction — proactively routing an eligible one *into* it, which is what makes the whole feature reachable without a driver having to already know the URL.

## Dependencies

**Depends on:** task-13-onboarding-step4-review-submit.md, task-14-onboarding-status-screen.md, task-07-activation-gate.md
**Blocks:** None

**Context from dependencies:** By this wave, `/dashboard/onboarding` (from `task-08`, filled in by `task-09`–`task-14`) fully handles all four `DriverApplication` states on its own (welcome/wizard while `DRAFT`, status screen otherwise) — this task only decides *whether* to send a driver there, not what they see once they arrive.

## Files to Modify

- `src/app/dashboard/page.tsx` — add the redirect, evaluated after the existing driver-profile-exists check.

## Technical Details

The current driver branch (after `task-08`'s wave-3 thinning) renders `<DriverDashboard>` unconditionally for any non-`COMPANY` session. Add the onboarding check immediately before that, but **after** confirming a `DriverProfile` exists — `DriverDashboard` already has its own "profile isn't set up yet" fallback for a driver who never completed the sign-up flow's follow-up `POST /api/driver-profile` call, and this redirect must not race that: a driver with literally no profile should see the existing fallback, not get bounced into a wizard whose step 1 assumes a profile record already exists.

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// ...inside DashboardPage, before the final `return <DriverDashboard .../>`:

if (session!.user.role === "DRIVER") {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session!.user.id },
    select: {
      companyId: true,
      accountType: true,
      application: { select: { status: true } },
    },
  });

  const shouldOnboard =
    driverProfile !== null &&
    driverProfile.companyId === null &&
    (driverProfile.accountType === "INDIVIDUAL" ||
      driverProfile.accountType === "INDIVIDUAL_ENTREPRENEUR") &&
    driverProfile.application?.status !== "APPROVED";

  if (shouldOnboard) {
    redirect("/dashboard/onboarding");
  }
}
```

This mirrors `task-08`'s own eligibility predicate in `/dashboard/onboarding/page.tsx` exactly (same four conditions) — the two are deliberately symmetric: one bounces *out* of the wizard when ineligible, this one routes *into* it when eligible, and a driver who is eligible for one is exactly the driver who should end up on the other.

`driverProfile === null` (no profile at all) evaluates `shouldOnboard` to `false`, so `DriverDashboard`'s existing interrupted-sign-up fallback still renders exactly as it does today — this task changes nothing about that case.

## Acceptance Criteria

- [ ] An independent Individual or Individual Entrepreneur driver with no `DriverApplication` (or a `DRAFT`/`PENDING`/`ACTION_REQUIRED` one) visiting `/dashboard` is redirected to `/dashboard/onboarding`.
- [ ] A `BUSINESS`-type driver, a company-affiliated driver, and an `APPROVED` driver all still see the normal `DriverDashboard` at `/dashboard`, unredirected.
- [ ] A driver with no `DriverProfile` at all still sees `DriverDashboard`'s existing "profile isn't set up yet" fallback, not a redirect into the wizard.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Manually verified: the full loop from `requirements.md`'s acceptance criteria works end to end starting from a fresh Individual sign-up landing on `/dashboard` and being sent straight into the wizard.

## Notes

- This is the final task in the feature's dependency graph — once it lands, run through `action-required.md`'s "After Implementation" manual click-through in full.
