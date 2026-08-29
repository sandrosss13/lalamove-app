# Task 08: Onboarding Wizard Shell

## Status

complete

## Wave

3

## Description

Builds the route, the shared layout guard, and every piece of chrome the wizard's individual steps (`task-09`–`task-14`, wave 4) plug into: the welcome screen, step rail, progress bar, a draft-state context that owns loading/saving/navigation, the shared document-upload dialog, and a light-theme toast. This task deliberately builds **stub** step components (a placeholder body, real props) rather than the real step UIs, so wave 4's six tasks can each fill in exactly one stub file in parallel with no overlap. Read `design_handoff_driver_onboarding/README.md`'s "Driver — Welcome" and "Interactions & behaviour" sections before starting — the welcome screen, step rail, progress bar, and toast timing/animation are all specified there in detail this task must match.

## Dependencies

**Depends on:** task-05-onboarding-draft-api.md (`GET`/`PATCH`/`POST reset` at `/api/driver-profile/onboarding`), task-06-onboarding-documents-api.md (upload-url + document-record endpoints)
**Blocks:** task-09-onboarding-step1-auth-personal.md, task-10-onboarding-step2-licence.md, task-11-onboarding-step3-chassis-class.md, task-12-onboarding-step3c-technical-details.md, task-13-onboarding-step4-review-submit.md, task-14-onboarding-status-screen.md, task-20-onboarding-redirect-wiring.md

**Context from dependencies:** `task-05`'s `GET /api/driver-profile/onboarding` returns `{ status, reference, draftStep, draftUpdatedAt, draft, documents[], submittedSummary }` (full shape in that task file); `PATCH` does a whole-blob replace of `{ draftStep, draft }`; `POST .../reset` clears everything back to a fresh draft. `task-06`'s two endpoints (`.../documents/upload-url`, `.../documents`) plus `src/lib/supabase-browser-client.ts`'s `uploadFileToSignedUrl` are how a file actually gets from the browser into a `DriverApplicationDocument` row.

## Files to Create

- `src/app/dashboard/layout.tsx` — shared guard for every route under `/dashboard` (see below — this is a small, deliberate behavior change from today's `page.tsx`, explained in Technical Details).
- `src/app/dashboard/onboarding/page.tsx` — server component: eligibility guard specific to onboarding, then renders the client shell.
- `src/components/driver-onboarding/onboarding-draft-context.tsx` — client context: fetches/holds draft state, exposes save (debounced `PATCH`)/navigation/document helpers.
- `src/components/driver-onboarding/onboarding-wizard-shell.tsx` — the client root: welcome screen, step rail + progress bar chrome, renders the current step.
- `src/components/driver-onboarding/onboarding-step-rail.tsx`
- `src/components/driver-onboarding/onboarding-progress-bar.tsx`
- `src/components/driver-onboarding/onboarding-toast.tsx`
- `src/components/driver-onboarding/document-upload-dialog.tsx` — shared modal, used by every document slot in `task-09`/`task-10`/`task-14`.
- `src/components/driver-onboarding/steps/step-1-auth-personal.tsx` — **stub**, filled by `task-09`.
- `src/components/driver-onboarding/steps/step-2-licence.tsx` — **stub**, filled by `task-10`.
- `src/components/driver-onboarding/steps/step-3-chassis-class.tsx` — **stub**, filled by `task-11`.
- `src/components/driver-onboarding/steps/step-3c-technical-details.tsx` — **stub**, filled by `task-12`.
- `src/components/driver-onboarding/steps/step-4-review-submit.tsx` — **stub**, filled by `task-13`.
- `src/components/driver-onboarding/application-status-screen.tsx` — **stub**, filled by `task-14`.

## Files to Modify

- `src/app/dashboard/page.tsx` — remove the inline "Please sign in" markup and the `mustChangePassword`/`CLIENT` redirects (moved into the new `layout.tsx`); keep only the `COMPANY`/driver branching.

## Technical Details

### 1. `src/app/dashboard/layout.tsx` — new shared guard

`/dashboard` has no layout today, so `src/app/dashboard/page.tsx` inline-guards itself (session check, `mustChangePassword` redirect, `CLIENT` redirect) and a new sibling route like `/dashboard/onboarding` would inherit none of it. This task centralizes those three guards. **Behavior change, called out deliberately**: today, visiting `/dashboard` signed out shows an inline "Please sign in / Sign up" card; after this task it redirects to `/sign-in` instead, matching how the rest of the app (e.g. `sign-in-form.tsx`'s post-sign-in routing) already prefers redirects over inline auth prompts. This is intentional, not an oversight — a layout can't selectively guard only its sibling routes while leaving the root page's own inline UI untouched, since it wraps every child.

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (session.user.role === "CLIENT") {
    redirect("/account");
  }

  return <>{children}</>;
}
```

### 2. `src/app/dashboard/page.tsx` — thin out

Remove the now-redundant inline "Please sign in" block and the `mustChangePassword`/`CLIENT` redirects (the layout above already guarantees a session, a driver/company role, and a non-`mustChangePassword` account by the time this page runs). What's left is exactly the existing `COMPANY`/driver branch:

```tsx
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { DriverDashboard } from "@/components/dashboard/driver-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  // Non-null by the layout guard above.

  if (session!.user.role === "COMPANY") {
    return <CompanyDashboard userId={session!.user.id} />;
  }

  return (
    <DriverDashboard userId={session!.user.id} userName={session!.user.name} />
  );
}
```

(The non-null assertion mirrors how `admin/layout.tsx` + its leaf pages already split guard-vs-content across a layout/page boundary in this codebase — check that pair for the exact idiom preferred here if it differs from the sketch above.) **This task does not add the redirect that sends an eligible driver into `/dashboard/onboarding`** — that's `task-20`, later, once the wizard and status screen both exist. This task's `page.tsx` change is a pure refactor with no new onboarding-routing behavior.

### 3. `src/app/dashboard/onboarding/page.tsx` — eligibility guard + entry point

Guaranteed by the layout: signed in, not `mustChangePassword`, not `CLIENT`. This page adds the onboarding-specific checks and fetches the driver's application state directly via Prisma (a server component querying the database directly, not fetching its own API route):

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingDraftProvider } from "@/components/driver-onboarding/onboarding-draft-context";
import { OnboardingWizardShell } from "@/components/driver-onboarding/onboarding-wizard-shell";

export const dynamic = "force-dynamic";

export default async function DriverOnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session!.user.id;

  if (session!.user.role !== "DRIVER") {
    redirect("/dashboard");
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    select: {
      accountType: true,
      companyId: true,
      application: { select: { status: true } },
    },
  });

  const eligible =
    driverProfile !== null &&
    driverProfile.companyId === null &&
    (driverProfile.accountType === "INDIVIDUAL" ||
      driverProfile.accountType === "INDIVIDUAL_ENTREPRENEUR") &&
    driverProfile.application?.status !== "APPROVED";

  if (!eligible) {
    redirect("/dashboard");
  }

  return (
    <OnboardingDraftProvider>
      <OnboardingWizardShell />
    </OnboardingDraftProvider>
  );
}
```

This guard is defensive (protects a direct/bookmarked visit) — `task-20` is what proactively *sends* an eligible driver here from `/dashboard`. Note it bounces a driver with no `DriverProfile` at all straight to `/dashboard` rather than into the wizard — `DriverDashboard` already has its own "profile isn't set up yet" fallback for that interrupted-sign-up case (see `src/components/dashboard/driver-dashboard.tsx`), and this page must not race that.

### 4. `onboarding-draft-context.tsx` — the data layer every step reads/writes

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { OnboardingDraftV1 } from "@/lib/driver-onboarding/draft-schema";

type OnboardingDocument = {
  type: "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK";
  status: "PENDING" | "APPROVED" | "FLAGGED";
  flagReason: string | null;
  signedUrl: string | null;
  uploadedAt: string;
};

type OnboardingState = {
  loading: boolean;
  status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED" | null;
  reference: string | null;
  draftStep: number;
  draftUpdatedAt: string | null;
  draft: OnboardingDraftV1;
  documents: OnboardingDocument[];
  submittedSummary: Record<string, unknown> | null;
  // Merges `patch` into the current draft (shallow at the section level —
  // e.g. updateDraft({ personal: {...} }) replaces the whole `personal`
  // object, matching how each step owns one section) and schedules a
  // debounced PATCH.
  updateDraft: (patch: Partial<OnboardingDraftV1>) => void;
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  showToast: (message: string, tone?: "default" | "error") => void;
};

const OnboardingDraftContext = createContext<OnboardingState | null>(null);

const SAVE_DEBOUNCE_MS = 300;

export function OnboardingDraftProvider({ children }: { children: React.ReactNode }) {
  // useState-per-concern, fetch GET on mount, PATCH on a debounced timer
  // whenever `updateDraft` is called, matching the SEARCH_DEBOUNCE_MS idiom
  // already used elsewhere in this codebase (see
  // src/app/admin/(sections)/users/clients/page.tsx). Toast state + a
  // 2.2s auto-dismiss timer, rendered via <OnboardingToast>.
  // ...full implementation: state for each field above, a `saveTimer` ref,
  // GET on mount into state, updateDraft merges + resets the debounce timer
  // + calls PATCH, goToStep does an immediate (non-debounced) PATCH with the
  // new draftStep so a step-rail click is never lost to a pending debounce.
}

export function useOnboardingDraft(): OnboardingState {
  const ctx = useContext(OnboardingDraftContext);
  if (!ctx) throw new Error("useOnboardingDraft must be used within OnboardingDraftProvider");
  return ctx;
}
```

Implement the body following this codebase's established `useState`-per-field + `fetch` + inline-error conventions (see `sign-up-form.tsx`) — the sketch above fixes the **shape** (every field/method wave-4 tasks depend on) and the **debounce**/**immediate-save-on-navigation** behavior; the loading/error UI states themselves (initial load spinner, a failed-save indicator distinct from a failed-load) are part of this task's acceptance criteria below, not optional polish.

### 5. `onboarding-wizard-shell.tsx` — welcome screen + step routing

Owns one local piece of UI state, `phase: "welcome" | "step"`, defaulting to `"welcome"` on every mount regardless of `draftStep` (per the design: the welcome screen is always shown first, offering **Resume** — jumps straight to `draftStep` — or **Start a new application** — calls `POST .../reset` then goes to step 1). Welcome screen copy (exact, from the design, with its own documented "five steps" typo fixed to four): heading "Become a partner driver", sub "Four steps. Around 12 minutes if your licence and vehicle documents are to hand. Progress is saved as you go.", an outline list of the four step names/subs from `RAIL` below, and — only when `draftUpdatedAt !== null` — an orange-bordered "Unfinished application" banner with a saved-at line and a **Resume** button; always show a secondary **Start a new application** button.

Once `phase === "step"`, render `<OnboardingStepRail>` + `<OnboardingProgressBar>` (both fed `draftStep`) alongside whichever of the four step components matches `draftStep` (1 → step-1, 2 → step-2, 3 → step-3-chassis-class then step-3c-technical-details as two sub-phases of the same numeric step — track a `substep` the same way the design's own `STEP_META`/`RAIL` arrays do, or use `draftStep` values 3 and 3.5-equivalent; implementer's choice, just keep it consistent with what `task-11`/`task-12` expect as their own entry point — document whatever you choose in this file's own top-of-file comment so those two tasks can read it there), 4 → step-4, and — when `status !== "DRAFT"` — `<ApplicationStatusScreen>` instead of any wizard step at all (a resumed session whose application was submitted while the tab was open elsewhere should show status, not a stale step).

Step rail entries (verbatim from the design, `RAIL`):

```ts
const RAIL = [
  { n: "1", label: "Authorisation & personal", sub: "Phone, ID, city, photo" },
  { n: "2", label: "Licence verification", sub: "Photos, number, expiry, categories" },
  { n: "3", label: "Vehicle registration", sub: "Body, class, make, plate, capacity" },
  { n: "4", label: "Review & status", sub: "Submit, pending, approved" },
];
```

(Note: the design's own `RAIL` sub-copy for step 1 includes "OTP" — drop it, matching this feature's decision to remove the OTP screen entirely.)

Rail entries are clickable and jump directly to that step (`goToStep`). Panels animate in with a `fadeUp 0.3s ease` (define as a Tailwind `@keyframes`/utility in this component's own scope or a small shared CSS module — this codebase has no existing fadeUp utility to reuse). Progress bar: four segments, filled orange up to and including the current step, `width` transition `0.35s`.

### 6. `onboarding-step-rail.tsx` / `onboarding-progress-bar.tsx`

Small presentational client components, props `{ currentStep: number; onSelect: (step: number) => void }` and `{ currentStep: number }` respectively. Build with Tailwind + `src/components/ui` primitives where they fit (e.g. `Badge` for the mono step-number badge) — no new dependency.

### 7. `onboarding-toast.tsx` — light-theme toast

Same mechanism as `src/components/dashboard/ops/ops-toast.tsx` (fixed-position div fed from local state, 2.2s auto-dismiss, `tone: "default" | "error"`) but **do not import or reuse that file** — it's styled for the dark ops console (`--ops-*` tokens). This is a new, light-themed component using this feature's own default-theme surface colours (matching the design's `rgba(17,17,19,0.94)` fixed-bottom-centre toast, 11px radius, fade-up 0.2s).

### 8. `document-upload-dialog.tsx` — the shared modal

Built on `src/components/ui/dialog.tsx` (do not hand-roll a modal). Props:

```tsx
type DocumentSlot = "selfie" | "licFront" | "licBack";

const CAPTURE_META: Record<DocumentSlot, { title: string; hint: string; guide: string; badge: string }> = {
  selfie: { title: "Upload your profile photo", hint: "A recent photo of your face, matched against your ID by the review team.", guide: "Face centred, no hat or sunglasses, plain background.", badge: "STEP 1 · PROFILE PHOTO" },
  licFront: { title: "Upload the front of your licence", hint: "The photo, name and licence number must be readable.", guide: "All four corners visible, no glare across the card.", badge: "STEP 2 · LICENCE FRONT" },
  licBack: { title: "Upload the back of your licence", hint: "The category table is what the reviewer checks.", guide: "All four corners visible, category rows legible.", badge: "STEP 2 · LICENCE BACK" },
};

const SLOT_TO_DOCUMENT_TYPE: Record<DocumentSlot, "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK"> = {
  selfie: "PROFILE_PHOTO",
  licFront: "LICENCE_FRONT",
  licBack: "LICENCE_BACK",
};

export function DocumentUploadDialog({
  slot,
  open,
  onOpenChange,
  onUploaded, // (signedUrl: string) => void — caller updates its own local "uploaded" state
}: {
  slot: DocumentSlot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (signedUrl: string) => void;
}) { /* ... */ }
```

Body: a dashed dropzone — "Drag a file here, or click to browse", the slot's `guide` line, "JPG or PNG · max 10 MB". Client-side reject (inline message, no request sent) anything that isn't `image/jpeg`/`image/png` or is over 10MB before calling the upload-url endpoint at all. On a valid file: `states: "idle" | "uploading" | "failed"` — call `POST .../documents/upload-url` with `{ type: SLOT_TO_DOCUMENT_TYPE[slot], fileName: file.name, contentType: file.type }`, then `uploadFileToSignedUrl(path, token, file)` from `src/lib/supabase-browser-client.ts`, then `POST .../documents` with `{ type, path }`, then call `onUploaded(signedUrl)` and close the dialog. Any failure at any of those three steps sets `state: "failed"` with an inline retry, never a silent no-op. Footer: "Files are checked by the review team, not automatically." + Cancel. Header: mono badge (`CAPTURE_META[slot].badge`), `title`, `hint`.

### 9. Step stubs

Each stub is a minimal placeholder with the **real** prop signature its wave-4 task will fill in, so the shell (built in this task) never has to change again once wave 4 lands. Example (`step-1-auth-personal.tsx`; the other four follow the same shape — no props beyond what `useOnboardingDraft()` already provides, since every step reads/writes through the shared context rather than prop-drilling):

```tsx
"use client";

export function Step1AuthPersonal() {
  return <div className="text-sm text-neutral-500">Step 1 — coming soon.</div>;
}
```

`application-status-screen.tsx`'s stub takes no props either (reads `useOnboardingDraft()` for `status`/`documents`/`submittedSummary`).

## Acceptance Criteria

- [ ] Visiting `/dashboard` signed out redirects to `/sign-in`; with `mustChangePassword: true` redirects to `/change-password`; as a `CLIENT` redirects to `/account` — all now via `layout.tsx`, and `page.tsx` no longer contains any of that logic.
- [ ] Visiting `/dashboard/onboarding` as a `COMPANY` user, a `BUSINESS`-type driver, a company-affiliated driver, or a driver whose application is already `APPROVED` redirects to `/dashboard`.
- [ ] Visiting `/dashboard/onboarding` as an eligible driver renders the welcome screen first, every time (not skipped even mid-draft).
- [ ] "Resume" jumps to the exact `draftStep` from the last save; "Start a new application" calls the reset endpoint and lands on step 1 with an empty draft.
- [ ] The step rail and progress bar both reflect the current step and update immediately on navigation.
- [ ] `DocumentUploadDialog` rejects an oversized or wrong-type file client-side with an inline message and no network request; a network/API failure during upload shows a retry, never a silent failure.
- [ ] `useOnboardingDraft()` throws a clear error if called outside `OnboardingDraftProvider` (a wave-4 task using it wrong should fail loudly, not silently return `undefined`).
- [ ] `pnpm lint` and `pnpm typecheck` pass with every step stub in place (they don't need to render anything beyond their placeholder yet).

## Notes

- Do not build the real step 1–4 UIs in this task, even partially — every stub must stay a one-line placeholder so wave 4's six tasks have a clean, conflict-free file to fill in.
- The exact `draftStep` numbering scheme for steps 3a/3b vs. 3c (whether that's `3`/`3.5`, a `step`+`substep` pair, or something else) is this task's call to make and document at the top of `onboarding-wizard-shell.tsx` — `task-11` and `task-12` will read whatever you chose there.
