# Task 09: Surface stop contacts and order context to drivers and ops

## Status

pending

## Wave

2

## Description

The booking form now collects a contact at each stop, a service level, a load-space body type and — for Business clients — a purchase-order reference. None of it is worth collecting if the person doing the job cannot see it. This task surfaces all of it in the driver hub's job detail panel.

This is also what makes the service-level copy honest. Automated matching does not read `serviceLevel` in this pass, but the order carries the flag and the driver and ops can see it — so the tier descriptions can truthfully say the order is flagged, without promising matching behaviour that does not exist.

## Dependencies

**Depends on:** task-03-schema-and-migrations.md
**Blocks:** None

**Context from dependencies:** task-03 added to `Order`: `pickupContactName`, `pickupContactPhone`, `pickupContactDetails`, `dropoffContactName`, `dropoffContactPhone`, `dropoffContactDetails` (all `String?`); `serviceLevel ServiceLevel @default(REGULAR)` where `enum ServiceLevel { PRIORITY REGULAR POOLING }`; `bodyType ChassisType?`; and `purchaseOrderRef String?`. All are nullable except `serviceLevel`, so every panel must render a null case.

## Files to Modify

- `src/lib/dashboard/hub/jobs.ts` — select the new fields and map them into the job row/detail shape
- `src/components/driver-hub/screens/jobs-detail-panel.tsx` — render them
- `src/components/driver-hub/screens/jobs-format.ts` — labels for the two new enums, if formatting is needed

## Technical Details

### Implementation Steps

1. **Read all three files first**, plus `src/components/driver-hub/hub-primitives.tsx` and `src/components/driver-hub/hub-status.ts`. This is the driver hub, which has a strict and well-documented design language — match it exactly rather than inventing.

2. **Loader layer** (`src/lib/dashboard/hub/jobs.ts`): add the new columns to the `select`, and map enums to display strings **server-side in an exhaustive switch**, as `toHubJobStatus` already does at `:174-187`. This module is `import "server-only"` and returns ISO strings and unformatted numbers — no `Date` and no Prisma model may cross the client boundary. Keep that.

3. **Panel layout** (`jobs-detail-panel.tsx`): add a **Contacts** section following the panel's existing section pattern exactly:

   ```
   heading: <h3 className="mt-5 mb-0.5 text-[13px] font-semibold">
   row:     "flex items-center justify-between gap-3 border-t border-muted py-2.5 text-[13px]"
   ```

   Two rows, Pickup and Dropoff. Each shows the name, the phone in `font-price`, and the block/floor/room. Where a stop has no contact at all, render the module's `EMPTY_VALUE` em dash — **never `0` and never an empty row**. Follow the null-vs-zero rule the hub applies everywhere.

4. **Phone numbers must be actionable.** Render the phone as a `tel:` link. A driver looking at this panel on a phone is the primary user. Keep it inside the row's existing type treatment.

5. **Service level**: render as a pill in the panel's existing pill row (`"mt-4 mb-5 flex flex-wrap gap-2"`). Use the neutral info pill string already repeated across the hub's three detail panels:

   ```
   "h-auto rounded-full border-transparent bg-muted px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground"
   ```

   **Do not add a seventh tone to `hub-status.ts`.** Its six tones are a closed vocabulary. Service level is not a status.

   Labels: `Priority`, `Regular`, `Pooling` — from an explicit lookup, never a string transform.

6. **Body type**: another neutral pill in the same row. Labels `Dry box`, `Refrigerated`, `Open chassis`. Omit the pill entirely when null.

7. **Purchase-order reference**: a row in the existing detail section, labelled `PO reference`, value in `font-price`, omitted entirely when null. Most orders will not have one.

8. **Colour rule**: the hub uses no raw Tailwind palette colours at all — only semantic tokens plus a fixed set of documented `oklch()` literals, each **written out in full at every use site** because Tailwind scans source text and a class assembled from a variable is never generated. If you need a colour, take it from `hub-primitives.tsx:42-60` or `hub-status.ts:22-38`. Do not introduce a new one.

9. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### House rules that apply to every task in this spec

- The driver hub is light-only and carries `data-admin-surface`. **Never write a `dark:` utility** — they cannot match there.
- Every number, phone, id and date uses `font-price`.
- `EMPTY_VALUE = "—"` for null. Never render `0` for a missing value.
- British English; enum values map through an explicit lookup, never `replace(/_/g, " ")`.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] The job detail panel shows a Contacts section with pickup and dropoff rows
- [ ] Phone numbers render as `tel:` links
- [ ] A stop with no contact renders an em dash, not an empty row or a zero
- [ ] Service level renders as a neutral pill using the existing repeated pill class string
- [ ] Body type renders as a neutral pill and is omitted when null
- [ ] `PO reference` renders only when present
- [ ] No new tone was added to `hub-status.ts`; no new colour literal was introduced
- [ ] Enum-to-label mapping happens server-side in an exhaustive switch in the loader
- [ ] No `Date` object or Prisma model crosses the server/client boundary
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

Do not make dispatch match on `bodyType` in this task. `Vehicle.chassisType` is nullable (`prisma/schema.prisma:702-704`), so every already-onboarded vehicle without one would become undispatchable under a strict match. Display only. Whether dispatch should honour body type is recorded as a follow-up in `../action-required.md`.
