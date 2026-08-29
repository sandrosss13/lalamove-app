# Task 11: Step 2 — Fleet Composition

## Status

pending

## Wave

4

## Description

Fills in `src/components/fleet-onboarding/steps/step-2-fleet-composition.tsx`, the step where a company declares *how many* vehicles it runs in each (cargo body type × vehicle class) combination. It collects no plates and no specifications — it builds the list that step 3 then fills in, one row per declared vehicle.

Three panels, one per cargo body type, each headed by a 104px inline SVG side view and the body's description, with one row per vehicle class: class name, capacity line, category chip, and a −/count/+ stepper. Seven of the fifteen cells have no backing `VehicleTypeSpec` and render **locked** — disabled, with a short note where the stepper would be — rather than falling back to a mismatched spec, which would misprice orders. Panel headers carry their own subtotal and a footer card carries the grand total.

## Dependencies

**Depends on:** task-09-fleet-wizard-shell.md, task-04-vehicle-class-taxonomy.md
**Blocks:** None

**Context from dependencies:**

**From `task-09`** — `src/components/fleet-onboarding/fleet-draft-context.tsx` exports:

```ts
export const FLEET_SCREENS = {
  company: 1, fleet: 2, vehicles: 3, drivers: 4, review: 5,
} as const;

export function useFleetDraft(): FleetDraftState;   // throws outside the provider
```

The parts of `FleetDraftState` this step uses — field-for-field as `task-09` declares them, which is the one definition of the surface:

```ts
{
  draft: FleetDraftV1;
  updateDraft: (patch: Partial<FleetDraftV1>) => void;   // section-level merge, debounced 300 ms
  goToStep: (step: number) => void;                      // saves immediately
  showToast: (message: string, tone?: "default" | "error") => void;
}
```

The relevant slice of `FleetDraftV1` (`src/lib/fleet-onboarding/draft-schema.ts`, from `task-05`):

```ts
export type FleetDraftFleet = {
  /** Key is `${chassisType}:${classId}`, e.g. "REFRIGERATED:MEDIUM_TRUCK". */
  counts?: Record<string, number>;
};

export type FleetDraftV1 = {
  version: 1;
  company?: FleetDraftCompany;      // task-10
  fleet?: FleetDraftFleet;
  /** Generated and owned by task-12. This step never touches it. */
  vehicles?: FleetDraftVehicle[];
};

export type FleetDraftChassisType = "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";
export type FleetDraftVehicleClassId =
  | "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK" | "TRAILER_TRUCK";
```

**The counts are nested one level down, at `draft.fleet.counts`.** `draft.fleet` is a
`FleetDraftFleet` object, not the count map itself — a flat `fleet?: Record<string, number>` is the
wrong shape and would break the shell's rail tally, `task-12`'s vehicle generation and `task-14`'s
submit at once. Every read in this step goes through `draft.fleet?.counts` and every write sends
`{ fleet: { counts: next } }`.

`updateDraft` merges at the **section** level, so `updateDraft({ fleet: { counts: next } })` replaces the whole `fleet` section and leaves `draft.company` and `draft.vehicles` untouched. That is exactly what this step needs, and it is why it must never send `{ fleet, vehicles }` together.

The three shared bounds also come from `draft-schema.ts` and are **imported, never redeclared**:

```ts
import {
  FLEET_MIN_VEHICLES,   // 2  — the minimum a business account may declare
  FLEET_MAX_VEHICLES,   // 40 — the cap on the whole application
  FLEET_MAX_PER_CELL,   // 40 — the stepper's own range, 0–40
} from "@/lib/fleet-onboarding/draft-schema";
```

`task-14` re-checks the same two bounds server-side at submit by importing the same three
constants. A local `MIN_FLEET_SIZE` / `MAX_FLEET_SIZE` / `MAX_PER_CELL` would be a second copy of a
number that has to agree with the server, and is exactly the drift this feature is trying to avoid.

The shell renders this step in a `max-w-[760px]` column, inside `<div key={draftStep} className="animate-onboarding-fade-up mt-7">`, under a header it owns: kicker `"Step 2 of 5 · Fleet"`, title `"Fleet composition"`. The Back button, the progress bar and the save indicator all belong to the shell. The shell also derives the rail's "Declared" tally from `draft.fleet?.counts`, so it updates live as steppers are clicked — this step does nothing to make that happen beyond writing the draft.

**From `task-04`** — `src/lib/driver-onboarding/vehicle-classes.ts`, grown to five classes and shared with the individual driver flow. **Only `task-04` may edit that file.** Its exported surface:

```ts
export type VehicleClassId =
  | "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK" | "TRAILER_TRUCK";

export type VehicleClass = {
  id: VehicleClassId;
  name: string;
  /** Mono category chip, e.g. "CAT B". */
  chip: string;
  requiredLicenceCategory: LicenceCategory;   // "B" | "C" | "CE"
  /** Capacity line, e.g. "Up to 800 kg · 2 pallets". */
  capacityLine: string;
  samplesLine: string;
  /** (ChassisType) -> VehicleTypeSpec.code, or null when nothing backs the
   *  pair and the UI must lock it. */
  specCodeByChassis: Record<ChassisType, string | null>;
};

export const VEHICLE_CLASSES: VehicleClass[];        // in the design's order
export function findVehicleClass(id: VehicleClassId): VehicleClass;
export function resolveVehicleTypeSpecCode(
  classId: VehicleClassId,
  chassisType: ChassisType,
): string | null;
export function isClassLockedByLicence(
  classId: VehicleClassId,
  heldCategories: LicenceCategory[],
): boolean;                                          // not used by this step

/** The three cargo body types, in the design's order. */
export type BodyType = {
  id: ChassisType;                                   // "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS"
  label: string;                                     // "Refrigerated Vehicle"
  shortLabel: string;
  description: string;
};

export const BODY_TYPES: BodyType[];
export function findBodyType(id: ChassisType): BodyType;
```

**`BODY_TYPES` and `findBodyType` are imported from that module, not redeclared here.** `task-12`
imports the same two, `task-14`'s submit denormalises `chassisType` against them, and the copy is
the design's — three copies of the same three labels is three chances for one of them to drift. The
label field is **`label`**, not `name`: `BodyType` has `id` / `label` / `shortLabel` /
`description` and nothing else. This step reads `label` where it wants the panel heading
("Dry Box", "Refrigerated Vehicle", "Open Chassis") and `description` for the line beneath.

The five rows, verbatim (`id` · `name` · `chip` · required category · `capacityLine`):

```
SMALL_VAN           Small Van             CAT B   B    Up to 800 kg · 2 pallets
LARGE_VAN           Large Van             CAT B   B    800–1,500 kg · 4 pallets
MEDIUM_TRUCK        Medium Truck          CAT C   C    1.5–7 t · 8 pallets
HEAVY_FREIGHT_TRUCK Heavy Freight Truck   CAT C   C    7–18 t · 16 pallets · 3 axles
TRAILER_TRUCK       Trailer Truck         CAT CE  CE   18–24 t · 33 pallets · articulated
```

And the `specCodeByChassis` map, which is where the locks come from:

| Class | `DRY_BOX` | `REFRIGERATED` | `OPEN_CHASSIS` |
|---|---|---|---|
| `SMALL_VAN` | `MINIVAN` | **null** | **null** |
| `LARGE_VAN` | `CARGO_VAN` | `REFRIGERATED_VAN` | **null** |
| `MEDIUM_TRUCK` | `BOX_TRUCK` | `REFRIGERATED_TRUCK` | `FLATBED_TRUCK` |
| `HEAVY_FREIGHT_TRUCK` | `LARGE_FREIGHT_TRUCK` | **null** | **null** |
| `TRAILER_TRUCK` | `TRAILER_TRUCK` *(new, seeded by task-02)* | **null** | **null** |

Eight usable cells, seven locked.

## Files to Modify

- `src/components/fleet-onboarding/steps/step-2-fleet-composition.tsx` — replace `task-09`'s stub with the real step.

## Technical Details

### 1. Component shape

`"use client"`. Zero props. One exported component, `Step2FleetComposition`.

```tsx
const { draft, updateDraft, goToStep, showToast } = useFleetDraft();

/** The count map itself — nested one level inside the `fleet` section. */
const counts = useMemo(() => draft.fleet?.counts ?? {}, [draft.fleet?.counts]);

/** Whether the totals rule has already failed a Continue. Same "quiet until
 *  the first Continue" contract every other step uses. */
const [touched, setTouched] = useState(false);
```

Constants — the three bounds are **imported** from `draft-schema.ts` (see the dependency section);
the only thing declared locally is the key helper:

```ts
import {
  FLEET_MAX_PER_CELL,
  FLEET_MAX_VEHICLES,
  FLEET_MIN_VEHICLES,
} from "@/lib/fleet-onboarding/draft-schema";

/** The key `draft.fleet.counts` is indexed by. Also the key task-12 groups its
 *  generated vehicle rows under, which is why the format is load-bearing. */
function fleetKey(chassisType: FleetDraftChassisType, classId: VehicleClassId): string {
  return `${chassisType}:${classId}`;
}
```

Intro paragraph above the panels, `text-[13.5px] leading-[1.5] text-muted-foreground max-w-[640px]`:

> Set how many vehicles you run in each combination. You fill in plates and specifications for each one in the next step — this just builds the list.

Outer wrapper `flex flex-col gap-4`.

### 2. The three body-type panels

Panel order, labels and descriptions all come from `task-04`'s `BODY_TYPES`. This file declares **no
`BODY_TYPES` of its own** and no local copy of the three labels — the only thing it owns per body
type is the silhouette component, held in a small side map keyed by the body's `id`:

```ts
import { BODY_TYPES } from "@/lib/driver-onboarding/vehicle-classes";

/** The one thing this step adds to `task-04`'s three body types: a 104px side
 *  view, authored locally (§3). Everything else — order, label, description —
 *  is read straight off `BODY_TYPES`. */
const SIDE_VIEWS: Record<FleetDraftChassisType, () => React.ReactElement> = {
  DRY_BOX: DryBoxSideView,
  REFRIGERATED: RefrigeratedSideView,
  OPEN_CHASSIS: OpenChassisSideView,
};
```

Map `BODY_TYPES` in its own order to render the three panels, reading `body.label` for the heading
and `body.description` for the line beneath it, and `SIDE_VIEWS[body.id]` for the drawing. The
field is `label`, **not** `name` — `BodyType` has no `name`. Those three labels are "Dry Box",
"Refrigerated Vehicle" and "Open Chassis", and the descriptions are the design's verbatim, U+2212
minus and all ("Temperature-controlled, −20 °C to +8 °C. Cooling unit service record required per
vehicle."); they live in `task-04`'s module and if one reads wrong it is fixed there, not here.

Where a single body type is needed by id rather than by iteration, use `findBodyType(id)` rather
than a `.find()` over the array.

Panel shell: `overflow-hidden rounded-[14px] border border-border bg-card`.

Panel header: `flex items-center gap-3.5 border-b border-border bg-muted/40 px-4 py-3` — the tint stands in for the design's `#fbfbfb`, which has no token. It holds, left to right: the silhouette, a `flex-1` block with `body.label` at `text-[15px] font-semibold` and `body.description` at `mt-0.5 text-[12.5px] text-muted-foreground`, and the panel subtotal pushed right at `font-price text-[12.5px] font-semibold text-muted-foreground`.

Subtotal text follows the design's `groupTotals`: `"none"` at zero, otherwise `` `${n} vehicle` `` / `` `${n} vehicles` ``.

**All five class rows render in every panel** — fifteen rows in total, seven of them locked. The design's own Open Chassis panel omits the two van rows entirely, but `requirements.md`'s acceptance criterion is that the seven unbacked cells "render locked" and are "exactly those listed", so the vans are shown and locked with the design's own reason rather than silently disappearing. That is a deliberate, called-out deviation and the note copy in §4 carries the explanation the design gave in prose.

### 3. The 104px side views

Three local components, authored inline as SVG. No asset file, no icon library, no import — the design handoff explicitly says all imagery is inline SVG line drawing authored for the design. Each is:

```tsx
const SIDE_VIEW_CLASS_NAME = "h-auto w-[104px] shrink-0";
```

with `viewBox="0 0 360 150"`, `role="img"` and its own `aria-label`. The palette is the design's neutral line set: strokes `oklch(0.7 0 0)` at `strokeWidth="2"` with `strokeLinejoin="round"` and `strokeLinecap="round"`, panel lines `oklch(0.88 0 0)` at `1.4`, chassis rail `oklch(0.42 0 0)`, tyres `oklch(0.26 0 0)`, hubs `oklch(0.84 0 0)`.

All three share the same cab and running gear, drawn front-right: a rounded cab shell rising from the chassis with a bonnet sloping to the windscreen, a shaded side window, one front wheel under the cab and one rear wheel under the body, each a dark tyre disc with a light hub. Draw the body behind it — that is the only part that differs.

**`DryBoxSideView`** — `aria-label="Dry box truck"`. A tall, fully enclosed rectangular box occupying the rear two-thirds, with a horizontal seam near its roof and one vertical panel division across the middle:

```tsx
<g stroke="oklch(0.7 0 0)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
  <path d="M240 118 V62 Q240 53 249 51 L287 43 Q295 43 300 49 L321 76 Q331 82 331 97 V118 Z" fill="#fbfbfb" />
  <path d="M251 63 L285 56 V78 H251 Z" fill="#dfe4e8" />
  <path d="M30 30 H240 V118 H30 Z" fill="#f7f7f8" />
</g>
<g stroke="oklch(0.88 0 0)" strokeWidth="1.4">
  <path d="M30 37 H240 M150 30 V118" />
</g>
<path d="M26 118 H332 V128 H26 Z" fill="oklch(0.42 0 0)" />
<g fill="oklch(0.26 0 0)"><circle cx="96" cy="128" r="18" /><circle cx="272" cy="128" r="19" /></g>
<g fill="oklch(0.84 0 0)"><circle cx="96" cy="128" r="7.5" /><circle cx="272" cy="128" r="8" /></g>
```

**`RefrigeratedSideView`** — `aria-label="Refrigerated truck"`. The dry box body, plus the two shapes that make it read as refrigerated: a roof-mounted cooling unit sitting on the front of the box (a rounded rectangle above the roofline at the cab end, with two horizontal grille lines in `oklch(0.76 0 0)`), and a blue snowflake on the body's side panel — three crossed strokes in `#2f5fb8` at `strokeWidth="2.6"`, `strokeLinecap="round"`, no fill. It drops the dry box's vertical panel division; the snowflake occupies that space.

```tsx
{/* added to the stroked group, after the box body */}
<path d="M198 8 H242 Q248 8 248 14 V30 H192 V14 Q192 8 198 8 Z" fill="#eceef0" />
```
```tsx
<g stroke="oklch(0.76 0 0)" strokeWidth="1.4"><path d="M200 16 H240 M200 24 H240" /></g>
<g stroke="oklch(0.88 0 0)" strokeWidth="1.4"><path d="M30 37 H240" /></g>
{/* …chassis, tyres, hubs as above… */}
<g stroke="#2f5fb8" strokeWidth="2.6" strokeLinecap="round" fill="none">
  <path d="M96 60 v24 M85 66 l22 12 M85 78 l22 -12" />
</g>
```

**`OpenChassisSideView`** — `aria-label="Flatbed truck with drop sides"`. No roof and no enclosed box: a low flat deck with short drop sides, occupying only the lower third of the body area, with a horizontal rail line along the sides and two vertical stake posts. The whole vehicle sits lower, so the chassis rail and the wheels move down with it:

```tsx
<g stroke="oklch(0.7 0 0)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
  {/* same cab shell and window as above */}
  <path d="M30 74 H240 V106 H30 Z" fill="#f7f7f8" />
</g>
<g stroke="oklch(0.86 0 0)" strokeWidth="1.4"><path d="M30 90 H240 M110 74 V106 M170 74 V106" /></g>
<path d="M26 106 H332 V118 H26 Z" fill="oklch(0.42 0 0)" />
<g fill="oklch(0.26 0 0)"><circle cx="96" cy="126" r="18" /><circle cx="272" cy="126" r="19" /></g>
<g fill="oklch(0.84 0 0)"><circle cx="96" cy="126" r="7.5" /><circle cx="272" cy="126" r="8" /></g>
```

`src/components/driver-onboarding/steps/step-3-chassis-class.tsx` has its own richer versions of these three silhouettes at the same viewBox. Do **not** import or extract them: they are module-private, tuned for a much larger card (extra body seams, mirrors, marker lamps that turn to mush at 104px), and lifting them would mean editing another wave-4-owned file from this one. Author these three locally.

### 4. Class rows, steppers and locked cells

For each panel, map `VEHICLE_CLASSES` in order. For each class, `const specCode = resolveVehicleTypeSpecCode(cls.id, body.id)` — `null` means locked. Derive it; never hard-code the lock set, so the map stays owned by `task-04`.

**An unlocked row:**

```
className={`flex items-center gap-3.5 border-b border-border px-4 py-[11px] last:border-b-0 ${
  count > 0 ? "bg-onboarding-accent/[0.03]" : "bg-card"
}`}
```

That tint is the design's `rgba(255,90,31,0.03)`.

Contents, left to right:

- A `min-w-0 flex-1` block: the class name at `text-[13.5px] font-semibold`, coloured `text-foreground` when `count > 0` and `text-muted-foreground` when zero; the capacity line beneath at `mt-px text-[11.5px] text-muted-foreground`.
- The category chip: `font-price shrink-0 rounded-[5px] bg-muted px-[7px] py-[3px] text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground`, containing `cls.chip` ("CAT B" / "CAT C" / "CAT CE").
- The stepper, `shrink-0`, as a `<div role="group" aria-label={`${cls.name} · ${body.label}`} className="flex items-center">` — `cls.name` from `VEHICLE_CLASSES`, `body.label` from `BODY_TYPES`:
  - **Minus** — `size-8 cursor-pointer rounded-l-lg border border-border bg-card text-base text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40`, label the U+2212 minus sign `−`, `aria-label="Remove one"`. Disabled at `count === 0`.
  - **Count** — `flex h-8 w-11 items-center justify-center border-y border-border bg-card font-price text-sm font-semibold`, `aria-live="polite"`, coloured `text-onboarding-accent` when `count > 0` and `text-muted-foreground` when zero.
  - **Plus** — the same button chrome with `rounded-r-lg`, label `+`, `aria-label="Add one"`. Disabled when `count === FLEET_MAX_PER_CELL` **or** when the grand total is already at `FLEET_MAX_VEHICLES` — the cap is on the application, not the cell, so the last vehicle has to be blocked wherever it would be added.

**A locked row** keeps the same layout so the panels read as one table, at reduced emphasis and with a note where the stepper was:

```
className="flex items-center gap-3.5 border-b border-border bg-card px-4 py-[11px] opacity-60 last:border-b-0"
aria-disabled="true"
```

Class name muted, capacity line and chip unchanged, and in the stepper's place:

```tsx
<p className="shrink-0 text-right text-[11.5px] text-muted-foreground">{lockNote}</p>
```

The **seven locked cells**, exactly, with their notes:

| Body | Class | Note |
|---|---|---|
| `REFRIGERATED` | `SMALL_VAN` | `Not offered yet.` |
| `REFRIGERATED` | `HEAVY_FREIGHT_TRUCK` | `Not offered yet.` |
| `REFRIGERATED` | `TRAILER_TRUCK` | `Not offered yet.` |
| `OPEN_CHASSIS` | `SMALL_VAN` | `Vans are not sold as flatbeds.` |
| `OPEN_CHASSIS` | `LARGE_VAN` | `Vans are not sold as flatbeds.` |
| `OPEN_CHASSIS` | `HEAVY_FREIGHT_TRUCK` | `Not offered yet.` |
| `OPEN_CHASSIS` | `TRAILER_TRUCK` | `Not offered yet.` |

Hold the two van notes in a small local map keyed by `fleetKey(...)` and default everything else to `"Not offered yet."`:

```ts
/** Why a cell is locked, when the reason is more specific than "no spec backs
 *  it". Which cells lock is `task-04`'s `specCodeByChassis`, not this map —
 *  this only supplies copy. */
const LOCK_NOTES: Record<string, string> = {
  "OPEN_CHASSIS:SMALL_VAN": "Vans are not sold as flatbeds.",
  "OPEN_CHASSIS:LARGE_VAN": "Vans are not sold as flatbeds.",
};
const DEFAULT_LOCK_NOTE = "Not offered yet.";
```

Every Dry Box cell is unlocked; the Dry Box panel has no locked rows at all.

### 5. Writing counts — and why the write shape matters

```tsx
function bump(chassisType: FleetDraftChassisType, classId: VehicleClassId, delta: number) {
  const key = fleetKey(chassisType, classId);
  const next: Record<string, number> = { ...counts };
  const value = Math.max(0, Math.min(FLEET_MAX_PER_CELL, (next[key] ?? 0) + delta));

  // Zero is absence, not a stored 0 — matching the prototype, and keeping the
  // grand total a plain sum over the values with no filtering.
  if (value === 0) delete next[key];
  else next[key] = value;

  // NESTED. `fleet` is a section object whose only member is `counts`; the
  // count map is never the section itself.
  updateDraft({ fleet: { counts: next } });
}
```

Three rules this write must obey, because **`task-12` builds the vehicle list by matching `draft.vehicles[i].chassisType`/`vehicleClass` against these keys, and preserves already-specified vehicles by taking the first `n` of each group and adding or removing only at the tail**:

1. **Only ever touch the one key being bumped.** Copy the count map, change one entry, send it inside a fresh `fleet` section. Never rebuild the counts from `BODY_TYPES × VEHICLE_CLASSES`, never normalise them, never fill absent cells with zeroes — a rewritten object would make every group look changed to a diff that has to be conservative.
2. **The key format `${chassisType}:${classId}` is a contract**, not an implementation detail. Both halves are the enum values the draft stores, not display names, and the separator is a single colon — `"REFRIGERATED:MEDIUM_TRUCK"`, never a slash, a double colon or a display label. `task-12` splits on it and the shell sums over it.
3. **Never write `vehicles` from this step.** `updateDraft`'s section-level merge means `{ fleet: { counts: next } }` leaves `draft.vehicles` byte-identical, which is exactly what preserves step-3 work when a count changes. Reducing a count does *not* delete vehicle rows here; `task-12` owns that trim, and owns it on entry to step 3 so the company sees what changed. The preservation rule itself lives in `task-12` — this step's only job is to write counts in a way that lets it work.

Rapid clicking is coalesced by the context's own 300 ms debounce into one `PATCH`, so there is nothing to throttle here.

### 6. The grand-total footer and validation

Below the three panels:

```tsx
<div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
  <p className="text-[13.5px] text-muted-foreground">
    {total > 0
      ? "Vehicles to specify in the next step"
      : "Nothing declared yet — add at least two vehicles"}
  </p>
  <p className="font-price text-[19px] font-semibold tracking-[-0.01em]">{total}</p>
</div>
```

`const total = Object.values(counts).reduce((sum, n) => sum + n, 0);` — the same sum the shell's rail computes as `Object.values(draft.fleet?.counts ?? {}).reduce((a, b) => a + b, 0)`.

**Validation on Continue**, in this order:

```ts
function fleetProblem(total: number): string | undefined {
  if (total < FLEET_MIN_VEHICLES) {
    return "A business account needs at least two vehicles. Use the individual driver flow for a single vehicle.";
  }
  if (total > FLEET_MAX_VEHICLES) {
    return "A single application can cover at most 40 vehicles. Contact operations to register a larger fleet.";
  }
  return undefined;
}
```

The first message is the design's, verbatim. The second is this feature's, because the design has no cap; keep it exactly as written so `task-14`'s submit-time re-check can raise the same sentence.

The over-40 branch is unreachable by clicking, since the plus buttons disable at the cap — keep it anyway. A draft restored from another device, or one written before the cap existed, can exceed it, and `task-14` re-checks the same bound server-side at submit. A rule enforced in one place is a rule that will eventually be bypassed.

On failure: set `touched`, render the message inline beneath the footer card as `<p className="text-xs text-destructive">`, and raise it in a toast. **On the table steps the toast carries the field message itself**, not the form steps' "Fix the highlighted fields to continue." — that is the design's own rule (`step >= 4 ? Object.values(p)[0] : …`), and fleet composition is a table step:

```tsx
function handleContinue() {
  const problem = fleetProblem(total);
  if (problem !== undefined) {
    setTouched(true);
    showToast(problem, "error");
    return;
  }
  goToStep(FLEET_SCREENS.vehicles);
}
```

The Continue button is the shared primary CTA in a `mt-4 flex items-center gap-3.5 border-t border-border pt-[22px]` footer:

```
className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
```

No API call — this step writes only to the draft, and `goToStep` persists it immediately.

## Acceptance Criteria

- [ ] Three panels render in the order Dry Box, Refrigerated Vehicle, Open Chassis, each with the design's name, description and a 104px inline SVG side view authored in this file (no imported asset, no shared silhouette import).
- [ ] The refrigerated view is visibly distinguished by a roof-mounted cooling unit and a blue snowflake; the open chassis view has a low flat deck with drop sides and no roof.
- [ ] Every panel lists all five classes with the exact name, capacity line and category chip from `VEHICLE_CLASSES`.
- [ ] The stepper clamps each cell to 0–40, disables minus at 0, and disables plus at 40 **or** when the fleet total has reached 40.
- [ ] A row with a non-zero count tints `rgba(255,90,31,0.03)` and its count turns orange; a zero row stays on the card background with a muted class name and count.
- [ ] Exactly seven cells render locked — the seven in §4 — each disabled with its note in place of the stepper; the Dry Box panel has none.
- [ ] Which cells lock comes from `resolveVehicleTypeSpecCode` returning `null`, not from a hard-coded list in this file.
- [ ] Each panel header shows its own subtotal as "none" / "1 vehicle" / "n vehicles".
- [ ] The footer card shows the grand total and the line "Vehicles to specify in the next step" (or the zero-state line).
- [ ] Continue with a total below 2 shows "A business account needs at least two vehicles. Use the individual driver flow for a single vehicle." inline and in the toast, and does not navigate.
- [ ] Counts persist to `draft.fleet.counts` — nested, written as `updateDraft({ fleet: { counts: next } })` — under `${chassisType}:${classId}` keys, with zero counts removed rather than stored as 0, and survive a full page reload.
- [ ] Clicking a stepper never writes `draft.vehicles` and never rewrites any `draft.fleet.counts` key other than the one bumped.
- [ ] The three panel labels and descriptions come from `task-04`'s `BODY_TYPES` (`body.label` / `body.description`); the file declares no `BODY_TYPES`, no `BODY_LABEL` and no local copy of the three names.
- [ ] `FLEET_MIN_VEHICLES`, `FLEET_MAX_VEHICLES` and `FLEET_MAX_PER_CELL` are imported from `draft-schema.ts`; no `MIN_FLEET_SIZE` / `MAX_FLEET_SIZE` / `MAX_PER_CELL` is declared in this file.
- [ ] The rail's "Declared" tally updates as steppers are clicked.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not edit any file other than `steps/step-2-fleet-composition.tsx`. In particular `src/lib/driver-onboarding/vehicle-classes.ts` belongs to `task-04` — if a class's or a body type's copy looks wrong, raise it rather than patching it here, and never work around it with a local constant.
- Do not generate, trim or renumber `draft.vehicles`. That is `task-12`'s job, done on entry to step 3, and doing it here would race it.
- Rendering all five classes in all three panels (rather than omitting the two vans from Open Chassis as the prototype does) is a deliberate deviation, so that the seven locked cells are literally the seven unbacked ones and a company reading the panel learns *why* a combination is unavailable. The van rows carry the design's own reason as their note.
- `--primary` is near-black. Every orange is `bg-onboarding-accent` / `text-onboarding-accent` / `bg-onboarding-accent/[0.03]`.
- The row tint is an arbitrary-opacity utility (`bg-onboarding-accent/[0.03]`) because 3% is not on Tailwind's default opacity scale and the design names the exact value.
