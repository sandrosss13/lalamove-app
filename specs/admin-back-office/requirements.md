# Requirements: Admin Back-Office

## Summary

The platform (a Lalamove-style freight/delivery marketplace with CLIENT, DRIVER, and COMPANY-facing surfaces) has no internal back office today. Every operational lever — pricing/vehicle taxonomy, landing-page copy, order oversight, account moderation — either requires a direct database edit or doesn't exist at all. This feature adds an `/admin` back office where internal staff can manage platform content and operations: sales analytics/reporting, CMS-style content (banners, translations, static pages, messaging templates, home page composition), finance (payment methods, promo campaigns), user/account management (clients, drivers+companies, and the admin staff accounts themselves), and a first pass at CRM (segments, campaigns, surveys).

The back office is a new `UserRole.ADMIN` on top of the existing Better Auth setup, not a parallel auth system — internal staff sign in the same way client/driver/company users do, gated by role. Access within the back office is controlled by a fixed set of `AdminRole` values (e.g. `SUPER_ADMIN`, `FINANCE_MANAGER`) rather than a fully dynamic permission engine, keeping the RBAC surface small enough to ship in one pass.

Two sub-areas — real payment-gateway processing and real email/SMS sending for messaging templates — depend on a provider the user has not yet chosen (see `action-required.md`). Those tasks are placed in their own later wave and are written to be provider-agnostic where possible, but cannot be fully implemented until a provider is selected.

## Goals

- Give internal staff a single `/admin` surface to see sales performance, manage accounts, edit marketing/content, configure finance settings, and run early CRM workflows — without touching the database directly.
- Reuse the existing Better Auth setup and Prisma/Next.js App Router patterns already established in this codebase rather than introducing a parallel stack.
- Keep every new admin surface auditable (who changed what) via a lightweight audit log.
- Ship the foundation (schema, auth, shell) and the highest-value sections (analytics, user management, content, finance config) before the more speculative or externally-blocked sections (payment gateway, real message sending, CRM).

## Non-Goals

- **Dynamic, per-user granular permissions.** Access control is role-based with a small fixed enum of `AdminRole`s, not a configurable permissions matrix. Revisit only if the fixed roles prove insufficient in practice.
- **Full dynamic CRM.** Segments/campaigns/surveys ship as scoped-down CRUD over simple criteria (JSON filters), not a rules engine, drip sequences, or A/B testing. This is explicitly the most speculative section and is sequenced last.
- **Third-party payment gateway selection.** This spec does not pick Polar vs. Stripe vs. another provider — see `action-required.md`. The payment-gateway-integration task is scoped to plug in whichever provider is chosen, following that provider's own best-practice skill/agent already present in this repo (e.g. `polar-payments-expert`) if Polar is chosen.
- **Third-party email/SMS provider selection.** Same as above for messaging send integration — see `action-required.md`.
- **Multi-language content beyond Georgian + English.** Russian and other locales are out of scope for this pass (the user explicitly chose ka/en only).
- **Automated tests.** Per project convention (AGENTS.md), no test-writing tasks are included; manual verification (lint, typecheck, exercising the flows) is expected per task.

## Acceptance Criteria

- [ ] A user with `UserRole.ADMIN` and an active `SystemUserProfile` can sign in and reach `/admin`; every other role is redirected away from `/admin`.
- [ ] The admin shell exposes navigation to all five sections: Sales Analytics, Content Management, Finances, User Management, CRM.
- [ ] Sales Analytics shows turnover, revenue, and order counts by status (completed/cancelled/pending/in-process-or-delivery) for a selected date range (calendar picker + Today/This Week/This Month shortcuts), and can export the current report to Excel.
- [ ] User Management lets an admin view/moderate Clients and Sellers (drivers + logistics companies), and lets a sufficiently-privileged admin (`SUPER_ADMIN`) create/deactivate System User (admin staff) accounts with an `AdminRole`.
- [ ] Content Management lets an admin CRUD banners, static pages, translation entries (ka/en), messaging template content (email/SMS), and compose the home page's sections — and the public landing page actually reflects the admin-managed home page sections and banners.
- [ ] Finances lets an admin toggle which payment methods are enabled and CRUD promo campaigns (discount codes).
- [ ] CRM lets an admin CRUD segments (simple JSON criteria), surveys, and campaigns (linking a segment + a messaging template).
- [ ] Every create/update/delete action performed in `/admin` writes an `AuditLog` row.
- [ ] `pnpm check` (lint + typecheck) passes after each task.

## Assumptions

- "Sellers" in User Management means both `DRIVER` accounts and `COMPANY` (`LogisticsCompany`) accounts, viewed/moderated together (confirmed with user).
- "System Users" means the internal admin/staff accounts that log into the back office itself (confirmed with user).
- Translations cover both UI chrome strings and CMS content (banners/pages/templates), in Georgian and English only — the user picked the language set but didn't split UI-vs-content scope, so both are included since a "Translations" admin module conventionally manages both.
- "Messaging templates" covers Email and SMS channels (not push), matching the recommended option the user's answer built on.
- The empty/trailing "Marketing" bullet under CRM is folded into `CrmCampaign` — a campaign *is* the marketing action (segment + template + schedule) — rather than a separate model, since the user gave no further detail.
- Payment gateway and messaging-send provider are **not yet chosen** by the user (see `action-required.md`). Wave 5 tasks are written against a provider-agnostic interface with the concrete provider call sites clearly marked as pending a decision.
- **Admin panel is served on its own subdomain** (an `admin.` host, e.g. `admin.localhost:3000` locally, `admin.<production-domain>` in production — the user explicitly asked for this, superseding an earlier draft of this spec that had proposed a path-based-only `/admin` for simplicity). It follows exactly the same tri-state env-var pattern as the existing merchant/client split (`NEXT_PUBLIC_MERCHANT_HOST` in `src/lib/host.ts`): a new `NEXT_PUBLIC_ADMIN_HOST` var, unset by default so the split is opt-in and `/admin` still works path-based on the main host until it's configured. The admin split is independent of the merchant split — either can be enabled without the other.
- No shadcn/ui primitives exist in this project yet (`components.json` absent, `src/components/ui` absent). The admin foundation task sets up shadcn with the primitives the back office needs (table, dialog, dropdown-menu, calendar, popover, tabs, etc.) rather than hand-rolling each one, since dozens of admin screens need consistent CRUD/table/form UI.

## Technical Constraints

- Reuse Better Auth (`src/lib/auth.ts`) and Prisma (`prisma/schema.prisma`, `src/lib/prisma.ts`) exactly as already configured — no parallel auth or ORM.
- All new Prisma models/enums are added in a single schema task (Wave 1) to avoid concurrent-edit conflicts on `prisma/schema.prisma` across parallel tasks; every later task only reads the generated Prisma Client types.
- Admin routes live under `src/app/admin/**`; admin-only API routes live under `src/app/api/admin/**`. Both are gated by the same `requireSystemUser()` guard built in Wave 2.
- The full admin navigation tree (sidebar + section-level tab layouts) is built once in Wave 2 so that later, parallel section tasks never need to touch shared layout/nav files — each task only adds its own leaf `page.tsx` and API routes.
- Excel export uses a lightweight library (`exceljs`, add via `pnpm add exceljs`) rather than a heavier reporting service.
- Follow existing code conventions: doc comments explaining *why* (not just what) on non-obvious fields, `@/lib`/`@/components` path aliases, the existing Prisma enum/model comment style seen throughout `prisma/schema.prisma`.
