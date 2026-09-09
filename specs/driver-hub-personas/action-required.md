# Action Required: Driver Hub Personas

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Decide whether to commit or stash the in-flight suspension work** — the current branch `fix/suspended-account-gate` carries uncommitted changes to `prisma/schema.prisma`, `src/lib/auth.ts` (+182 lines) and both admin suspend/unsuspend routes, and `git log main..HEAD` is empty. This spec touches none of those files, but implementing on top of an uncommitted schema change makes the diff hard to review. *Default if you do nothing: agents implement on the branch as-is and leave the suspension changes untouched.*
- [ ] **Delete the macOS `* 2.*` copy artefacts** — verified counts: under `src/` there are **25 empty directories** ending in ` 2` (harmless — an empty directory declares no route) and **two real files that Next does compile**: `src/app/api/loads/route 2.ts` and `src/app/dashboard/(hub)/loads/page 2.tsx`, both byte-identical to their originals. Outside `src/` there are nine more untracked duplicates across `UI:UX/` and `specs/driver-load-board/`, plus `tmp-suspend-check.ts` at the repo root. The two compiled files are the ones that matter: they will not receive persona changes and will drift. *Default if you do nothing: agents leave every one of them alone.*
- [ ] **Confirm the roster-driver Wallet decision** — this spec hides `/dashboard/earnings` from roster drivers outright rather than relabelling it as a non-currency work summary. Reversing this after task-01 and task-03 land is cheap but not free. *Default if you do nothing: the screen is hidden, as specified.*

## During Implementation

- [ ] **Provide test accounts for all three personas** — verifying the redirects and the fleet rollups needs one independent driver, one driver with `DriverProfile.companyId` set, and one `role === "COMPANY"` session, ideally each with completed orders. *Default if you do nothing: agents verify by reading code and running `pnpm lint` / `pnpm typecheck` only, and the runtime behaviour goes unverified.*

## After Implementation

- [ ] **Re-sync the design handoff** — `UI:UX/Registered Driver account (New)/Driver dashboard header alignment/github.md` claims three things landed that did not (the client-shaped top nav, the notifications bell, and a driver "My account" screen). None are in this spec's scope; the file should be corrected so the next handoff does not compound the error. *Default if you do nothing: the stale claims remain.*
- [ ] **Decide the follow-up order for the three deferred P0/P1 gaps** — the unactivated-account state (the Load Board currently tells a pending driver "No loads on the board right now" instead of "under review"), the mobile shell, and the header rebuild. *Default if you do nothing: they stay unscheduled.*

---

> These tasks are also referenced in context within the relevant task files.
