# Task 11: Finances — Payment methods configuration

## Status

pending

## Wave

4

## Description

Lets staff toggle which `PaymentMethodType`s (`CASH`, `CARD`, `BANK_TRANSFER`) are enabled platform-wide. This task manages the on/off switch and non-secret config only — it does not process any real payment (that's task-13, Wave 5, blocked on a provider decision per `action-required.md`). Until task-13 lands, `CASH` is expected to be the only realistically enabled method; this task doesn't need to know that, it just stores whatever staff set.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** task-13-payment-gateway-integration.md (Wave 5, which reads/depends on these toggles to decide what to offer at checkout).

**Context from dependencies:** task-01 added `PaymentMethodConfig` (`type: PaymentMethodType` unique, `isEnabled`, `config: Json?`). task-02 provides the admin guard/audit helpers, shadcn primitives, and the `/admin/finance/*` tab layout (`src/app/admin/(sections)/finance/layout.tsx`, already links to `/admin/finance/payment-methods`).

## Files to Create

- `src/app/admin/(sections)/finance/payment-methods/page.tsx` — one row per `PaymentMethodType` (seed missing rows lazily on first load if they don't exist yet — see step 2 below) with an enable/disable toggle and, for `CARD`, a placeholder note that gateway integration is pending (Wave 5).
- `src/app/api/admin/finance/payment-methods/route.ts` — `GET` (list, seeding any missing `PaymentMethodType` rows as `isEnabled: false` first).
- `src/app/api/admin/finance/payment-methods/[type]/route.ts` — `PATCH` `{ isEnabled: boolean }`.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. Routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "FINANCE_MANAGER"])`.
2. On `GET`, for each value in the `PaymentMethodType` enum not yet present as a `PaymentMethodConfig` row, `upsert` it with `isEnabled: false` before returning the list — this keeps the UI simple (always exactly one row per enum value) without requiring a separate seed script.
3. `PATCH /api/admin/finance/payment-methods/[type]` updates `isEnabled` (and accepts an optional `config` object for future use, though no `type` needs one yet).
4. `writeAuditLog` on toggle, `action: "payment_method.enable" | "payment_method.disable"`, `entityType: "PaymentMethodConfig"`, `entityId: type`.

### API Endpoints

- `GET /api/admin/finance/payment-methods`
- `PATCH /api/admin/finance/payment-methods/[type]` — body `{ isEnabled: boolean }`.

## Acceptance Criteria

- [ ] `/admin/finance/payment-methods` shows all three `PaymentMethodType` values with working toggles, even on a fresh database with no rows yet.
- [ ] Toggling persists and writes an `AuditLog` row.
- [ ] Non-`FINANCE_MANAGER`/`SUPER_ADMIN` roles get `403`.
- [ ] `pnpm check` passes.
