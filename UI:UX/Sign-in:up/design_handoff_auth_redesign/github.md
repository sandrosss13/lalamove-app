repo: sandrosss13/lalamove-app
branch: main
path: src

## Last sync

date: 2026-09-10T17:55:01Z

### Updated in this project

- Redesigned the public sign-in and sign-up flow (role step, account type, credentials).
- Added phone + OTP as the primary sign-in method, with email/password as a second tab.
- Added Google / Apple / Facebook continue options.
- Added OTP entry, wrong-password error, forgot-password and success states.
- Header rebuilt from the real layout: text wordmark plus Sign in / Sign up links.

## Screen map

| Project screen | Repo files |
| --- | --- |
| Role step, Account type | src/components/auth/sign-in-form.tsx, src/components/auth/sign-up-form.tsx |
| Sign in, Wrong password, Forgot password | src/components/auth/sign-in-form.tsx, src/app/sign-in/page.tsx, src/lib/auth-client.ts |
| Sign up, OTP entry, Success | src/components/auth/sign-up-form.tsx, src/app/sign-up/page.tsx, src/lib/georgian-cities.ts |
| Site header (all screens) | src/app/layout.tsx, src/components/auth-status.tsx |
| (reference only) Back-office sign-in | src/app/(admin-sign-in)/admin/sign-in/page.tsx |
