# Task 12: Finances — Promo campaigns (discount codes)

## Status

pending

## Wave

4

## Description

CRUD admin UI for `PromoCampaign` rows — discount codes clients could redeem at checkout. This task covers the admin authoring side only; wiring a code into the actual order-creation/pricing flow (`src/lib/pricing.ts`, the booking form, `POST /api/orders`) so a client can actually apply one is **not** included — see Notes. Staff can create, edit, activate/deactivate, and view usage (`usedCount`/`usageLimit`) for each code.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** None.

**Context from dependencies:** task-01 added `PromoCampaign` (`code` unique, `discountType: DiscountType` (`PERCENTAGE`/`FIXED_AMOUNT`), `discountValue`, `startsAt`, `endsAt`, `usageLimit?`, `usedCount` default `0`, `isActive`). task-02 provides the admin guard/audit helpers, shadcn primitives, and the `/admin/finance/*` tab layout (already links to `/admin/finance/promo-campaigns`).

## Files to Create

- `src/app/admin/(sections)/finance/promo-campaigns/page.tsx` — table of promo campaigns (code, discount type/value, active window, usage `usedCount`/`usageLimit`, active status), "New Campaign" button, per-row edit/deactivate.
- `src/components/admin/finance/promo-campaign-form-dialog.tsx` — form: code (uppercase, validate simple alphanumeric pattern client-side), discount type select, discount value, start/end date pickers, optional usage limit, active toggle.
- `src/app/api/admin/finance/promo-campaigns/route.ts` — `GET` (list) and `POST` (create).
- `src/app/api/admin/finance/promo-campaigns/[id]/route.ts` — `PATCH` and `DELETE`.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. Routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "FINANCE_MANAGER"])`.
2. Standard Prisma CRUD against `prisma.promoCampaign`. Enforce `code` uniqueness via the existing `@@unique` constraint, surfacing a friendly error on `P2002` (same pattern as task-07's slug handling).
3. Validate `discountValue` client- and server-side: `PERCENTAGE` must be `0 < value <= 100`; `FIXED_AMOUNT` must be `> 0`. Validate `startsAt < endsAt`.
4. Deleting a campaign with `usedCount > 0` should be blocked (return `400`) in favor of deactivating it (`isActive: false`) — preserves redemption history integrity even though nothing reads it yet.
5. `writeAuditLog` on create/update/delete, `action: "promo_campaign.create" | "promo_campaign.update" | "promo_campaign.delete"`, `entityType: "PromoCampaign"`.

### API Endpoints

- `GET /api/admin/finance/promo-campaigns`
- `POST /api/admin/finance/promo-campaigns`
- `PATCH /api/admin/finance/promo-campaigns/[id]`
- `DELETE /api/admin/finance/promo-campaigns/[id]`

## Acceptance Criteria

- [ ] Staff can create/edit a promo campaign with discount type/value validation enforced.
- [ ] Staff can deactivate a campaign; deleting one with `usedCount > 0` is blocked with a clear error.
- [ ] Non-`FINANCE_MANAGER`/`SUPER_ADMIN` roles get `403`.
- [ ] `pnpm check` passes.

## Notes

- Actually redeeming a code (incrementing `usedCount`, applying the discount in `src/lib/pricing.ts`/the booking flow) is out of scope for this task and this spec's stated goals — it's client-facing checkout work, not a back-office admin surface, and was not part of what the user asked for. Flag it as a natural follow-up if the user wants codes to actually apply at checkout.
