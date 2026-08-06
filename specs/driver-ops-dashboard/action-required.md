# Action Required: Driver Ops Dashboard

No manual steps required for this feature itself — no new accounts, API keys, environment variables, or third-party services.

**One prerequisite that is not a "manual step" but must happen first:** `specs/company-ops-dashboard` must be implemented (at least its `task-04` and `task-06`) before this spec's Wave 1 begins. See the README's prerequisite note. If you run `/implement-feature` on this spec before that, Wave 1's `onSuccess`-prop task will still succeed, but Wave 2 (the shell) will fail to import `src/components/dashboard/ops/ops-dashboard-context.tsx` and the other two shared files, since they won't exist yet.

Same test-runner caveat as the company spec: this repo has no automated test runner configured, so verification is `pnpm lint` + `pnpm typecheck` + manual walkthrough per each task's acceptance criteria.
