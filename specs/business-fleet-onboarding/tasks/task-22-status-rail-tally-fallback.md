# Task 22: Step Rail Tally Reads Zero After Submit

## Status

pending

## Wave

8 (follow-up — found in the post-implementation walkthrough, not part of the original spec)

## Description

The wizard's left step rail carries a live fleet tally — **Declared**, **Specified**, **Drivers assigned**. It is computed from the draft, and the draft is deliberately cleared to `Prisma.DbNull` on a successful submit (`task-14`), with `GET /api/logistics-company/onboarding` returning `draft: null` for any status other than `DRAFT` (`task-05`). The context then falls back to an empty `{ version: 1 }` draft.

The consequence is that from the moment an application is submitted, the rail reads:

```
FLEET
Declared            0
Specified           —
Drivers assigned    —
```

…while the status screen immediately to its right lists the real fleet. Confirmed on a live application: an **approved** company with two vehicles, one approved and one flagged, rendered `Declared 0` beside a Fleet status table showing both vehicles. It is visible on every `PENDING`, `ACTION_REQUIRED` and `APPROVED` application — i.e. on the screen a company sees for the entire review period and forever after.

Cosmetic — nothing downstream reads the tally, and the numbers are right for the whole of the `DRAFT` phase, which is when the rail is actually a navigation aid. But it is wrong on the surface a company looks at most, and it contradicts the table beside it.

## Dependencies

**Depends on:** None — `task-09` and `task-15` are both complete and committed.
**Blocks:** None

**Context from dependencies:**

The tally is computed once in `src/components/fleet-onboarding/fleet-wizard-shell.tsx` (~line 229) and passed to **all three** `FleetStepRail` render sites:

```tsx
const declared = Object.values(draft.fleet?.counts ?? {}).reduce((a, b) => a + b, 0);
const vehicles = draft.vehicles ?? [];
const specified = vehicles.filter(isVehicleSpecified).length;
const assigned = vehicles.filter((v) => Boolean(v.driverProfileId)).length;

/** A "x/y" tally row, muted until every vehicle in a non-empty list is done. */
function completionRow(key: string, done: number): FleetTallyRow {
  if (vehicles.length === 0) {
    return { key, value: "—", tone: "muted" };
  }
  return {
    key,
    value: `${done}/${vehicles.length}`,
    tone: done === vehicles.length ? COMPLETE_TONE : "muted",
  };
}

const tally: FleetTallyRow[] = [
  { key: "Declared", value: String(declared), tone: "default" },
  completionRow("Specified", specified),
  completionRow("Drivers assigned", assigned),
];
```

The three render sites are the **non-`DRAFT`/status branch** (~line 341, whose own comment notes the rail is kept "for continuity"), the **welcome phase** (~line 362), and the **step chrome** (~line 446). Only the first is wrong; the other two are correct, because the draft is populated whenever they render.

`useFleetDraft()` already exposes everything the fix needs — no API or context change:

```ts
status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED" | null;
vehicleVerdicts: FleetVehicleVerdict[];   // one row per BusinessApplicationVehicle
```

Each verdict carries `chassisType`, `vehicleClass`, `plateNumber`, `status` and a nullable `driver` object.

## Files to Modify

- `src/components/fleet-onboarding/fleet-wizard-shell.tsx` — derive the tally from `vehicleVerdicts` once the application leaves `DRAFT`.

## Technical Details

### The rule

While `status === "DRAFT"` (or `status === null`, before the first load settles) keep the current draft-derived tally exactly as it is. Otherwise derive all three rows from `vehicleVerdicts`:

| Row | Post-submit source |
|---|---|
| Declared | `vehicleVerdicts.length` |
| Specified | `vehicleVerdicts.length` of `vehicleVerdicts.length` |
| Drivers assigned | count of verdicts with a non-null `driver`, of `vehicleVerdicts.length` |

**Specified is total-of-total by construction, not by measurement.** A vehicle cannot reach `BusinessApplicationVehicle` without passing `validateVehicleInput` in `task-14`'s submit, so every submitted vehicle is specified. Write it as `vehicleVerdicts.length` rather than re-running a completeness predicate against the verdict fields — the server already made that guarantee, and a second, weaker client-side check that disagrees would be worse than no check.

Reuse `completionRow`'s tone rule so a complete row still reads in success green and an incomplete one stays muted. `Drivers assigned` can legitimately be short of the total if a driver was removed from the roster after submission, which is exactly the case worth surfacing.

### What not to do

- **Do not read `submittedSummary.vehicleCount` for Declared.** It is built from the same rows and would agree, but then the three rows would come from two different sources and could diverge if one is ever reshaped. One source per phase.
- **Do not resurrect the draft post-submit** to make the existing computation work. The draft is nulled deliberately: a submitted application's normalized rows are the source of truth, and handing the client a stale draft it cannot save is the footgun `task-05` avoided.
- **Do not hide the tally on the status screen.** The rail is deliberately kept there "for continuity" (that branch's own comment); an empty gap where the fleet summary was is a worse answer than correct numbers.

### Edge cases

- `vehicleVerdicts` is `[]` while `status === "DRAFT"` — unchanged path, draft-derived.
- An application that is `PENDING` with zero verdict rows cannot occur (submit refuses below two vehicles), but if it somehow does, `completionRow`'s existing empty-list branch already yields `—` rather than `0/0`.
- A verdict whose `vehicleId` is `null` (vehicle removed out of band, FK is `SetNull`) still counts toward Declared — the application still covers it, and the status table still lists it.

## Acceptance Criteria

- [ ] A `PENDING` application with two vehicles shows `Declared 2`, `Specified 2/2`, `Drivers assigned 2/2` — not `0` and two em-dashes.
- [ ] An `APPROVED` application shows the same, and the numbers match the Fleet status table beside it.
- [ ] An `ACTION_REQUIRED` application with one flagged vehicle still counts that vehicle in all three rows.
- [ ] A verdict whose driver was removed from the roster shows `Drivers assigned 1/2` in the muted tone.
- [ ] The `DRAFT` phase is byte-for-byte unchanged: the welcome screen and every wizard step still show the draft-derived tally, and the step-3 jump guard still keys on the declared count.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Found by manual walkthrough against a live application, not by review — the spec never described what the rail should show after submit, so no reviewer had a rule to check it against. Worth remembering that the three tally rows were specified only for the wizard phase.
- Purely presentational. Nothing reads the tally except the rail: `handleSelectStep`'s guard uses `declared`, but it is only reachable while the wizard renders steps, which is `DRAFT`-only — so this change cannot affect navigation.
- Confirmed present on the deployed branch as of commit `26fd422` (wave 4).
