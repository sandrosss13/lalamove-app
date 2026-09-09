repo: sandrosss13/lalamove-app
branch: main

## Last sync

date: 2026-09-08T18:32:00Z

### Updated in this project

- Driver hub header rebuilt in the client site header's shape (wordmark, My orders / Wallet nav, name + My account + Sign out).
- Added driver-side notifications bell and an active-job indicator to that header.
- "My account" opens an account screen using the client account rail + panel structure.

## Screen map

| Project screen | Repo files |
| --- | --- |
| Driver Dashboard v2.dc.html (full dashboard, new header) | same as above, plus src/components/driver-hub/driver-hub-sidebar.tsx |
| Driver Header.dc.html | src/components/auth-status.tsx, src/app/layout.tsx, src/components/driver-hub/driver-hub-header.tsx, src/components/driver-hub/driver-hub-nav.ts, src/app/account/page.tsx, src/components/account-sidebar.tsx, src/lib/dashboard/hub/account.ts |
