# Action Required: Company Ops Dashboard

No manual steps required for this feature. All tasks can be implemented automatically — no new accounts, API keys, environment variables, or third-party services are introduced.

One thing worth the user's attention, not a blocking manual step: this repo has no automated test runner configured at all, so verification for this feature is `pnpm lint` + `pnpm typecheck` + manual walkthrough as described in each task's acceptance criteria. If route-level tests are wanted for the two new API endpoints (`cancel`, `vehicles/[id]/assignment`), that's a separate follow-up decision, not part of this spec.
