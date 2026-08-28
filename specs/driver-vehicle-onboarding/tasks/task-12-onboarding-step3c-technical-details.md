# Task 12: Step 3c — Vehicle Technical Details

## Status

pending

## Wave

4

## Description

Fills in `src/components/driver-onboarding/steps/step-3c-technical-details.tsx` — the third and last sub-screen of vehicle registration: make/model, year, plate, colour, declared payload, and cargo hold dimensions with a live diagram. This is the step whose values (`task-01`) are compliance-facing overrides on `Vehicle`, never read by pricing or matching — the copy in this step must not claim otherwise (see the note on the design's original "used to match you with orders" line, corrected below).

## Dependencies

**Depends on:** task-08-onboarding-shell.md, task-04-vehicle-classes-constant.md
**Blocks:** None

**Context from dependencies:** `useOnboardingDraft()` exposes `draft.vehicle` (already has `chassisType`/`classId` from `task-11`, plus whatever payload/dimension defaults that task seeded), `updateDraft`, `goToStep`. `task-11`'s chassis choice (`draft.vehicle.chassisType`) determines which diagram variant this step shows.

## Files to Modify

- `src/components/driver-onboarding/steps/step-3c-technical-details.tsx` — replace the stub with the real step.

## Technical Details

### Make/model

Searchable dropdown, same popover-and-filtered-list pattern as `task-09`'s city dropdown, filtered to the class chosen in step 3b. Full model list (from the design, verbatim):

```ts
const MODELS_BY_CLASS: Record<VehicleClassId, [make: string, model: string][]> = {
  SMALL_VAN: [
    ["Renault", "Dokker"], ["Fiat", "Doblò Cargo"], ["Toyota", "Proace City"],
    ["Ford", "Transit Connect"], ["Citroën", "Berlingo Van"], ["Peugeot", "Partner"],
  ],
  LARGE_VAN: [
    ["Fiat", "Ducato"], ["Ford", "Transit"], ["Mercedes-Benz", "Sprinter"],
    ["Renault", "Master"], ["Volkswagen", "Crafter"], ["Iveco", "Daily"],
  ],
  MEDIUM_TRUCK: [
    ["Hino", "916"], ["Mitsubishi Fuso", "Canter 7C15"], ["Isuzu", "NPR 75"],
    ["Iveco", "Eurocargo 120E"], ["Mercedes-Benz", "Atego 1018"], ["Ford Trucks", "1026"],
  ],
  HEAVY_FREIGHT_TRUCK: [
    ["MAN", "TGM 18.290"], ["MAN", "TGL 12.220"], ["Volvo", "FL 280"],
    ["Scania", "P 280"], ["DAF", "LF 260"], ["Mercedes-Benz", "Actros 1845"],
  ],
};
```

Free text is allowed if nothing in the list matches (the dropdown accepts arbitrary typed input, not just a selection from the list) — `draft.vehicle.make`/`model` are plain strings, not constrained to this list server-side either (see `task-13`'s submit validation, which does not re-check make/model against this table).

### Remaining fields

| Field | Control | Validation |
|---|---|---|
| Year | 4-digit number input | required; `1995 <= year <= <current year>` (compute the ceiling from `new Date().getFullYear()`, not a hard-coded number — note this codebase's *other*, unrelated "add a vehicle" form uses a `MIN_VEHICLE_YEAR = 1980` floor in `src/app/api/driver-profile/vehicles/validation.ts`; that's a different form for a different flow and this step's 1995 floor from the design does not need to match it) |
| Licence plate | mono text, forced uppercase | required, min 4 characters |
| Colour | 12 swatches, 4-across grid | required |
| Maximum payload (kg) | number input | required; `100 <= payload <= 40000`; error copy: "Payload above 40,000 kg needs a fleet account." |
| Cargo hold — length/width/height (m) | three number inputs | each required, `0 < value <= 20`; error copy: "Check the dimensions — metres, not centimetres." |

Colour swatches (from the design, verbatim):

```ts
const COLORS: [name: string, hex: string][] = [
  ["White", "#ffffff"], ["Silver", "#c9ccd1"], ["Grey", "#8a8f96"], ["Black", "#1a1a1c"],
  ["Blue", "#2f5fb8"], ["Navy", "#1e2a4a"], ["Red", "#c0392b"], ["Green", "#2f7a4a"],
  ["Yellow", "#e8c33a"], ["Orange", "#e0691c"], ["Beige", "#ded3bd"], ["Brown", "#6b4a2f"],
];
```

Payload/dimension inputs are pre-filled from whatever `task-11` seeded in `draft.vehicle` from the chosen `VehicleTypeSpec`'s defaults, but remain freely editable — they're the driver's own declared/attested values (see `task-01`'s doc-comment update on `Vehicle`), not read-only.

### Cargo hold diagram

Above the length/width/height inputs, an inline SVG diagram card: a numbered truck side view (badge "1" at the length dimension, badge "3" at the height dimension) plus a rear view (badge "2" at the width dimension). The silhouette switches between a box body and a flatbed depending on `draft.vehicle.chassisType` (`DRY_BOX`/`REFRIGERATED` → enclosed box silhouette; `OPEN_CHASSIS` → flatbed silhouette), with a legend whose wording changes to match (an enclosed body's legend calls out "cargo box"; a flatbed's calls out "load bed"). Author as inline SVG directly in this component, mirroring the same bespoke-silhouette approach `task-11` uses for the chassis-type cards — no raster assets.

Below the diagram, a live-updating line as the driver types the three dimensions:

```
Usable volume {(length * width * height).toFixed(1)} m³
```

**Deviation from the design's original copy, deliberate**: the prototype's line reads "Usable volume {value} m³ — used to match you with orders." That claim is false in this codebase — per `task-01`, these declared dimensions are compliance-facing overrides only and are never read by order matching or pricing (only `VehicleTypeSpec`'s class-level values are). Use instead: **"Usable volume {value} m³ — shown to the review team alongside your declared payload."** Do not ship the original line; it would tell the driver something the backend doesn't actually do.

### Navigation

Continue validates all fields (red border + inline message on failure, "Fix the highlighted fields to continue." toast), then calls `goToStep(4)`.

## Acceptance Criteria

- [ ] Make/model dropdown filters to the chosen class's 6 models and accepts free text when nothing matches.
- [ ] Year, plate, colour, payload, and all three dimensions enforce the ranges/formats above, with the exact error copy for payload and dimensions.
- [ ] Plate input is forced uppercase as the driver types.
- [ ] The diagram silhouette and legend both switch correctly based on the chassis type chosen in the previous step.
- [ ] The live usable-volume line uses the corrected copy above, not the design's original "used to match you with orders" line.
- [ ] Every field survives a page reload via the draft.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
