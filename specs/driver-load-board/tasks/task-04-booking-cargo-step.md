# Task 04: Booking cargo step

## Status

complete

## Wave

2

## Description

Adds a new step to the client booking form (`src/components/home/booking-form.tsx`)
that captures the physical description of a load — weight, dimensions,
packaging, quantity, handling requirements, pickup window and delivery
deadline — on top of the vehicle class the client already picks. This is the
client-side half of the load board's central rule: *"only loads that fit the
signed-in driver's vehicle (max weight + L×W×H) are ever shown."* Without this
step there is no client-declared physical data for the board's fit filter
(task-06) to run against, and every new order would join the legacy orders
that are hidden from every driver by default.

This task is purely additive to the existing booking flow. It does not touch
pricing: `src/lib/pricing.ts`, `POST /api/pricing/estimate` and the fare
breakdown are untouched, and none of the new fields are sent to
`/api/pricing/estimate`. The vehicle class the client picks in the existing
"Recommended vehicle" step still drives the price; the new fields are declared
data carried alongside it. Client-side validation here is a convenience only
— `task-05-create-order-persistence.md` revalidates every field server-side
and is the authoritative source of truth for what `POST /api/orders` accepts.

## Dependencies

**Depends on:** task-01-schema-and-migration.md
**Blocks:** None

**Context from dependencies:**

task-01-schema-and-migration.md adds these columns to `Order` (exact names,
contractual — do not rename any of them):

- `cargoWeightKg Float?` — total load weight in kg
- `cargoLengthM Float?`, `cargoWidthM Float?`, `cargoHeightM Float?` — the
  largest single item's length/width/height in metres
- `packagingDescription String?` — free text, e.g. "4 pallets"
- `itemQuantity String?` — free text, e.g. "96 cartons"
- `handlingTags CargoHandlingTag[]` — defaults to `[]`, never null
- `pickupWindowStart DateTime?`, `pickupWindowEnd DateTime?` — the window the
  client will release the load in
- `deliveryDeadline DateTime?` — must arrive by

And the new enum:

```prisma
enum CargoHandlingTag {
  FRAGILE
  COLD_CHAIN
  HAZMAT
  TIME_CRITICAL
  UPRIGHT_ONLY
  HEAVY_ITEM
}
```

All eight new columns are nullable/empty-array at the schema level (task-01
makes every pre-existing order backfill-safe), but this task's own decision —
see "Required vs optional" below — is that the client-facing form makes four
of them mandatory to submit a *new* booking. Nullability at the database layer
and requiredness in this form are different concerns; do not conflate them.

This task only changes the client form and the request body it sends to
`POST /api/orders`. It does **not** implement server-side parsing, storage, the
`reference`/`commissionRate`/`driverPayout` stamping, or the check that
`bodyType` matches the vehicle — all of that is
`task-05-create-order-persistence.md`, which is a sibling Wave 2 task, not a
dependency of this one. `POST /api/orders` does not yet accept the new fields
until task-05 lands; this task's new fields are sent regardless (see
"Out of scope" below on why that ordering is fine).

## Files to Create

None.

## Files to Modify

- `src/components/home/booking-form.tsx` — add the new "Cargo details" step
  and its state, gating, validation and submit payload; renumber the existing
  step 6 to step 7 (see "Step placement" below).
- `src/lib/cargo.ts` — add a `CARGO_HANDLING_TAG_LABELS` table for
  `CargoHandlingTag`, mirroring the existing `CARGO_CATEGORY_LABELS` table in
  the same file.

## Technical Details

### 1. Step placement

**Read `src/components/home/booking-form.tsx` in full before editing it.** It
is 2000+ lines and this task changes state, gating and the render tree
together; line numbers quoted below are from the version this spec was written
against and will drift.

The form's seven cards today, in order:

| # | Title | Opens when |
|---|---|---|
| 1 | Delivery date & time | always |
| 2 | Route | a date and time are chosen |
| 3 | What are you moving? (cargo category) | both addresses are typed |
| 4 | Total weight | same gate as step 3 (`weightStepEnabled = goodsStepEnabled`) |
| 5 | Recommended vehicle (load space + vehicle type) | a weight bracket exists |
| 6 | Additional details (crew size + description) | a vehicle is chosen (`vehicleChosenStepsEnabled`) |
| — | Service level (unnumbered) | same gate as step 6 |

**Do not confuse step 4, "Total weight", with the new cargo weight field.**
Step 4's `maxWeightKg` is a capacity *bracket* the client picks to filter which
vehicle types are shown (backed by `weightOptions`, derived from
`VehicleTypeSpec.maxPayloadKg`) — it is never sent to `/api/orders` and has no
column on `Order`. The new `cargoWeightKg` is the actual declared weight of
the load, stored on the order, and read by the board's fit filter. The two
are related in spirit but are different pieces of state with different
purposes; keep them as two separate fields in two separate steps rather than
trying to reuse or rename `maxWeightKg`.

**Decision: insert a new step 6, "Cargo details", between the existing step 5
("Recommended vehicle") and the existing step 6 ("Additional details").** The
existing step 6 becomes step 7. The unnumbered Service level card is
unaffected (it carries no number and already sits after "Additional details";
it now sits after step 7 instead, with no code change needed beyond the fact
that it renders after the reordered JSX).

Why here and not elsewhere:

- **Not extending step 3/4.** Steps 3 and 4 are about *choosing a vehicle*
  (cargo category feeds the vehicle filter; the weight bracket feeds it too).
  The new fields are a *declaration* the vehicle choice does not depend on and
  does not feed. Mixing them into step 3/4 would make a client re-read the
  same "weight" word twice with two different meanings four lines apart.
- **Not extending step 6 ("Additional details").** That card holds crew size
  (a pricing input, sent to `/api/pricing/estimate`) and a free-text
  description. Cargo weight/dimensions/handling are a materially larger and
  more important block — required fields that gate driver visibility — and
  deserve their own numbered, nameable step rather than being buried under an
  "Additional details" heading a client has no reason to expect them in.
- **Why directly after step 5, not after step 6/7.** By the time step 5 is
  answered, `bodyType` (the load space: `DRY_BOX` / `REFRIGERATED` /
  `OPEN_CHASSIS`) is known. The cold-chain warning (see §5 below) compares the
  declared `handlingTags` against `bodyType`, so placing the cargo step
  immediately after the step that sets `bodyType` — rather than after crew
  size and description, which are unrelated to it — keeps the warning's two
  inputs adjacent in the form's reading order.
- **Gate:** the new step reuses the existing `vehicleChosenStepsEnabled` flag
  and the existing `CHOOSE_VEHICLE_FIRST` disabled-reason string — the same
  gate steps 6/7 and the Service level card already share, because a load's
  physical description is a sibling of "how the job is handled", not a
  successor requiring its own new gating predicate. Do not invent a new
  `cargoStepEnabled` flag; reuse `vehicleChosenStepsEnabled` directly.

**Every place the numbering is referenced, to change:**

1. `<StepCard step={6} title="Additional details" ...>` → `step={7}`. This is
   the *only* existing `step={N}` prop that changes; steps 1–5 are untouched.
2. The new `<StepCard step={6} title="Cargo details" ...>` is inserted
   immediately before the (now step 7) "Additional details" card and
   immediately after the closing `</StepCard>` of step 5, "Recommended
   vehicle".
3. The doc comment above `vehicleChosenStepsEnabled` currently reads "Step 6
   and the service-level card, which open together on the one condition…" —
   update this comment to say "Steps 6 and 7 and the service-level card" (it
   now gates three siblings, not two).
4. No other file references these step numbers. Confirmed by search: no test
   file, e2e spec, or component outside `booking-form.tsx` reads a `step={N}`
   prop or literal step title for this form.
   `specs/client-dashboard-booking-and-payment/tasks/task-17-progressive-gating.md`
   documents a *historical* step numbering (including a "Payment" step 7 that
   no longer exists — payment moved to its own page in a later, already-merged
   change). That file's `Status` is `complete`; it is a record of past work,
   not a live reference, and this task does not edit it.
5. `booking-form-primitives.tsx`'s `StepCard` component itself takes `step` as
   a bare `number` prop with no upper bound or registry to update — renumbering
   is confined to the two call-site changes above.

### 2. Required vs optional

**Decision: `cargoWeightKg`, `cargoLengthM`, `cargoWidthM` and
`cargoHeightM` are REQUIRED to submit a new booking. `packagingDescription`,
`itemQuantity`, `handlingTags`, `pickupWindowStart`/`pickupWindowEnd` and
`deliveryDeadline` are OPTIONAL.**

Rationale: the board's fit filter (task-01's schema notes, confirmed by
`specs/driver-load-board/requirements.md`'s Assumptions) treats a load with
unknown weight or dimensions as **not fitting any vehicle** and hides it from
every driver — the failure direction that costs a driver a wasted trip is the
one the filter avoids. If these four fields were optional, a client who
leaves them blank would book a load that is silently invisible to the entire
driver pool: the board's core feature would simply not work for that order,
with no error and no signal to the client that anything is wrong. That is a
worse outcome than a small amount of added friction on an already-shipped
flow. A client booking a delivery already supplies a pickup address, a
dropoff address, a cargo category and a vehicle class; a weight and rough
dimensions are information of the same kind, not a materially larger ask.

Trade-off acknowledged: this does add four required fields to a booking flow
that shipped without them, which is a genuine conversion risk on a form that
previously asked for less. The mitigation is scope, not an opt-out — the
fields are exactly four number inputs with generous tolerances (see §3), not
a sub-form, and three of the four (length/width/height) are commonly known
together from a single pallet or crate spec sheet.

The remaining fields (packaging, quantity, handling tags, pickup window,
delivery deadline) stay optional because none of them feed the fit filter —
task-01's schema comments and `requirements.md` are explicit that only
weight and L/W/H are read by it — so leaving them blank costs the client
nothing at match time; it only costs the driver some context they would
otherwise see in the load board's drawer.

**"The UI must warn the client that omitting weight/dimensions delays
matching"** (this task's brief) is satisfied by the required-field validation
itself: each of the four fields carries a persistent helper line (not a popup,
so a screen reader announces it same as any other field description) reading
*"Needed to show your load to drivers with the right vehicle."* and, once the
client has interacted with the field and left it invalid or empty, an inline
error in the same slot reading *"Enter a total weight — drivers can't be
matched to a load with unknown weight."* (and the equivalent for each
dimension). Being required does not remove the need to explain *why* — the
explanation is what makes the requirement legible rather than an
unexplained blocker on the submit button.

### 3. Input constraints

All four numeric fields use the shadcn `Input` component
(`@/components/ui/input`, already imported elsewhere in this codebase) with
`type="number"` and `inputMode="decimal"`, styled the same way step 6's
`Textarea` already is — `className="border-line text-sm
focus-visible:border-accent focus-visible:ring-accent/20"` — rather than the
`NATIVE_FIELD_CLASSES` treatment, which this file reserves for fixed-option
`<select>`s. `Input`'s own base classes are `bg-transparent` and set no
explicit text colour, so — exactly as `Textarea` does today inside the same
`bg-ink text-paper` `StepCard` — it inherits the card's palette with no
additional overrides needed.

**The bounds are not written in this form.** They live in
`CARGO_MEASUREMENT_BOUNDS` (`src/lib/cargo.ts`), keyed by request-body field
name, and `POST /api/orders` (task-05) reads the same table — because these
numbers are one half of a contract with two enforcers, and stated twice they
drift. They did: this form originally allowed 15 m of width and height against
the endpoint's 3 m and 4 m, so a 5 m width passed every check on the page, lit
the submit button, and came back a `400` with no field to blame. Point the field
descriptors at the shared table; never copy a figure out of it.

`src/lib/cargo.ts` is the right home because it is already the client-safe cargo
module — Prisma imported as types only, no `server-only` marker — so this client
component can import it without dragging `@prisma/client`'s runtime into the
browser bundle.

| Field | Min | Max | Precision | `step` attr | Reasoning |
|---|---|---|---|---|---|
| `cargoWeightKg` | 1 | 30000 | 1 decimal place | `0.1` | The heaviest vehicle in `prisma/seed.ts` (`SEMI_TRAILER`, `maxPayloadKg: 24000`) sets the ceiling; 30000 leaves headroom for a heavier type added later without another migration to this form. |
| `cargoLengthM` | 0.1 | 20 | 2 decimal places | `0.01` | The longest seeded vehicle (`SEMI_TRAILER`) is `cargoLengthM: 13.6`; 20 leaves headroom the same way. |
| `cargoWidthM` | 0.1 | 3 | 2 decimal places | `0.01` | The widest seeded vehicle is `2.5`, so nothing wider is carryable on this platform; a tight ceiling is what catches a mis-keyed `1.5` typed as `15`. |
| `cargoHeightM` | 0.1 | 4 | 2 decimal places | `0.01` | Same reasoning; tallest seeded vehicle is `2.7`. |

The `Min` column is this form's floor only. `POST /api/orders` accepts anything
strictly greater than zero — a garbage check rather than a usability one — so the
form's floor is the tighter of the two and a value it accepts always clears the
endpoint. The containment runs one way on purpose; the `Max` column is the half
that must match exactly.

Each field's helper line states its own accepted range, derived from the same
`bounds` object the parser checks, so the copy on screen cannot promise a range
the endpoint would refuse.

Values are held as strings in component state (`cargoWeightKgInput`, etc. —
name them distinctly from the eventual parsed number so a field mid-edit,
e.g. `"12."`, is never silently coerced to `12` under the client's cursor) and
parsed on demand with a small hand-rolled helper, matching this codebase's
house convention of no validation library and a parse function returning
`{ data } | { error }` (the same shape `parseCreateOrderBody` in
`src/app/api/orders/route.ts` uses server-side). This is a client-side
*convenience* only — task-05 re-validates every one of these constraints
server-side and is authoritative; a bug in this client parser can produce a
confusing inline message, never a bad write, because nothing here is trusted
downstream.

```ts
type ParseResult<T> = { data: T } | { error: string };

/**
 * Parses one of the four cargo number fields from its raw string state.
 * Client-side convenience only — see the note on `parseCreateOrderBody` in
 * task-05, which is what actually enforces these bounds.
 */
function parseCargoNumber(
  raw: string,
  { bounds, label }: { bounds: CargoMeasurementBounds; label: string },
): ParseResult<number> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { error: `Enter a ${label}.` };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { error: `Enter a valid ${label}.` };
  }
  // No unit here: `label` is the on-screen field label and already carries one
  // ("Width (m)"). The unit appears in the field's range helper instead.
  if (value < bounds.min || value > bounds.max) {
    return { error: `${label} must be between ${bounds.min} and ${bounds.max}.` };
  }

  return { data: value };
}
```

`bounds` is one entry of `CARGO_MEASUREMENT_BOUNDS`, passed whole rather than as
loose `min`/`max`/`unit` arguments so a call site cannot pair one field's ceiling
with another's unit.

Call this once per field wherever a validity boolean or an inline error
string is needed (the field's own blur/change handler, and the `canSubmit`
computation below) — do not duplicate the bounds as separate literals at each
call site.

**Pickup window and delivery deadline:**

- Pickup window is two time-of-day `<select>`s (`pickupWindowStartTime`,
  `pickupWindowEndTime`, both `""` by default), reusing the existing
  `TIME_SLOTS` list and `NATIVE_FIELD_CLASSES` styling — the same pattern step
  1's time select already uses — combined with the *already-chosen*
  `scheduledDate` via the existing `combineDateAndTime` helper. The window is
  the release window on the scheduled delivery day; it does not need its own
  date picker. Constraint: **both must be set or both left blank** (a client
  cannot declare a window with only one end), and when both are set,
  `pickupWindowEnd` must be strictly after `pickupWindowStart`.
- Delivery deadline is its own date + time-of-day pair: a second Popover +
  `Calendar` trigger modelled directly on step 1's date field (own `useId`s,
  own `deliveryDeadlineDate`/`deliveryDeadlineTime` state, own
  `datePickerOpen`-equivalent boolean), disabled before `scheduledDate ??
  todayStart`, plus a time `<select>` reusing the full (unfiltered)
  `TIME_SLOTS` list — the "already passed today" narrowing `availableTimeSlots`
  does for step 1 does not apply here, since a deadline is validated against
  the pickup window/scheduled time directly (see below), not against the
  current clock. Constraint: when set, the combined deadline must be strictly
  after `pickupWindowEnd` if a window was declared, else strictly after
  `scheduledDateTime`.

Render both constraints as an inline error (same visual treatment as the
numeric fields' errors) under the second of the two relevant controls, not as
a blocking `alert` — these two fields are optional, so the error only appears
once the client has put the fields into a contradictory state, never merely
for being empty.

### 4. Handling tags — chip pattern

Render the six `CargoHandlingTag` values as multi-select toggle chips, in enum
declaration order (`FRAGILE, COLD_CHAIN, HAZMAT, TIME_CRITICAL, UPRIGHT_ONLY,
HEAVY_ITEM` — task-01's enum order). Labels, added to `src/lib/cargo.ts`
alongside the existing `CARGO_CATEGORY_LABELS` table (same `Record<Enum,
string>`-keyed-by-import-type-only shape, so this file keeps its guarantee of
never pulling `@prisma/client`'s runtime into the browser bundle):

```ts
export const CARGO_HANDLING_TAG_LABELS: Record<CargoHandlingTag, string> = {
  FRAGILE: "Fragile",
  COLD_CHAIN: "Cold chain",
  HAZMAT: "Hazmat",
  TIME_CRITICAL: "Time critical",
  UPRIGHT_ONLY: "Upright only",
  HEAVY_ITEM: "Heavy item",
};
```

Add `CargoHandlingTag` to the `import type { CargoCategory, VehicleCategory }
from "@prisma/client"` line at the top of `src/lib/cargo.ts`.

**On the visual pattern — read this before copying colours from the design
handoff.** The design handoff at
`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md` (§Filter
panel) specifies the chip's *selected* state as background `oklch(0.145 0 0)`
/ text `oklch(0.985 0 0)`, and *unselected* as white with a 1px
`oklch(0.922 0 0)` border. **Do not copy those literal colour values into
this form.** That palette belongs to the driver-side load board's admin
surface (`data-admin-surface`, light mode, shadcn's neutral oklch tokens —
task-09 onward), which is a different theme from this page. The booking form
is the landing page's dark theme, and `booking-form-primitives.tsx` states
the rule explicitly: *"only the landing token utilities … never a hex
literal, and never a `dark:` variant"* — a raw `oklch(...)` literal violates
that rule exactly as a hex literal would.

Reproduce the *pattern* — a filled, inverted-text selected state against an
outlined unselected one, multi-select, toggled on click — using this page's
own tokens, the same way `PICK_CARD_SELECTED_CLASSES`/`PICK_CARD_IDLE_CLASSES`
already do for the goods and vehicle grids. Define a local chip class pair in
`booking-form.tsx` next to the other local option-geometry constants
(`CREW_OPTION_CLASSES`, `BODY_OPTION_CLASSES` — do not add these to
`booking-form-primitives.tsx`; like those two, this geometry is specific to
one control on one page, not shared across files):

```ts
const HANDLING_TAG_CLASSES =
  "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors";
const HANDLING_TAG_SELECTED_CLASSES = "border-accent bg-accent text-ink";
const HANDLING_TAG_IDLE_CLASSES =
  "border-line bg-transparent text-paper hover:border-accent/40";
```

Toggle handler:

```ts
function toggleHandlingTag(tag: CargoHandlingTag) {
  setHandlingTags((current) =>
    current.includes(tag)
      ? current.filter((existing) => existing !== tag)
      : [...current, tag],
  );
}
```

Render each chip as a `<button type="button" aria-pressed={selected}>` (the
same `aria-pressed` pattern the goods grid in step 3 already uses, not a
`sr-only` radio group — these are independent toggles, not a mutually
exclusive choice).

### 5. Cold-chain / body-type mismatch warning

Once `handlingTags` includes `COLD_CHAIN`, compare against the already-chosen
`bodyType` (set in step 5, "Recommended vehicle", by then in scope for the
new step). If `bodyType !== "REFRIGERATED"`, render a non-blocking inline
warning directly under the chip row:

> "Cold-chain cargo travels best in a refrigerated body. You picked
> {bodyTypeLabel} in the vehicle step above — go back and switch it if this
> load needs temperature control."

Use `role="status"` (advisory, not blocking) rather than `role="alert"`. Do
**not** disable submission, clear the `COLD_CHAIN` tag, or force `bodyType`
back to `REFRIGERATED` — the client may have a legitimate reason (e.g. a short
hop where the box stays cold enough without the equipment), and this task's
brief is explicit that this is a soft warning only. Look up the human label
for the mismatch message from the existing `BODY_TYPE_OPTIONS` array (already
defined in this file) rather than hardcoding it a second time.

### 6. Hazmat notice

Once `handlingTags` includes `HAZMAT`, render a second, permanent (not
dismissible) advisory line directly under the chip row, `role="status"`:

> "Hazmat loads require a driver with the appropriate carrier certification.
> This isn't checked automatically yet — see the compliance note in
> `specs/driver-load-board/action-required.md`."

This mirrors the reasoning already recorded in
`specs/driver-load-board/action-required.md` under "Gate hazmat loads on
driver certification": `DriverLicence` (see `prisma/schema.prisma`) has no
certification field, so nothing anywhere in this feature — not this form, not
the board's claim endpoint (task-08) — gates a hazmat load to a specially
licensed driver. The load is tagged and the client is told; that is the whole
of this task's obligation here. Do not attempt to add gating logic, a new
`DriverLicence` field, or an onboarding capture for this task — all three are
explicitly out of scope and tracked as follow-up work in that file.

### 7. State to add

All local `useState` in `BookingForm`, alongside the existing `cargoCategory`/
`bodyType`/etc. declarations:

```ts
// Raw string state for the four numeric fields — see the parse helper above
// for why these are not stored as numbers.
const [cargoWeightKgInput, setCargoWeightKgInput] = useState("");
const [cargoLengthMInput, setCargoLengthMInput] = useState("");
const [cargoWidthMInput, setCargoWidthMInput] = useState("");
const [cargoHeightMInput, setCargoHeightMInput] = useState("");

const [packagingDescription, setPackagingDescription] = useState("");
const [itemQuantity, setItemQuantity] = useState("");

const [handlingTags, setHandlingTags] = useState<CargoHandlingTag[]>([]);

const [pickupWindowStartTime, setPickupWindowStartTime] = useState("");
const [pickupWindowEndTime, setPickupWindowEndTime] = useState("");

const [deliveryDeadlineDate, setDeliveryDeadlineDate] = useState<Date | null>(
  null,
);
const [deliveryDeadlineTime, setDeliveryDeadlineTime] = useState("");
const [deadlinePickerOpen, setDeadlinePickerOpen] = useState(false);
```

Add `CargoHandlingTag` to the existing `import type { CargoCategory,
ChassisType, ServiceLevel } from "@prisma/client"` line at the top of the
file, and add `CARGO_MEASUREMENT_BOUNDS` plus `type CargoMeasurementBounds` to
the existing `@/lib/cargo` import beside `CARGO_HANDLING_TAG_LABELS` — see §3
for why the bounds are imported rather than written here.

### 8. Gating

```ts
// Reuses the existing gate — see "Step placement" above for why this is not
// a new predicate.
const cargoStepEnabled = vehicleChosenStepsEnabled;
```

Wire the new `StepCard` with `step={6}` `disabled={!cargoStepEnabled}`
`disabledReason={CHOOSE_VEHICLE_FIRST}` — the same disabled-reason constant
steps 6/7 already import and use; do not add a new string for an identical
reason.

### 9. Extending `canSubmit`

Cargo weight and dimensions must be valid to book, but must **not** gate
`canCalculate` — they carry no weight (pun unavoidable) in the fare, and a
client must still be able to price a job before declaring the physical load.
Only extend `canSubmit`:

Each call passes its field descriptor whole, and each descriptor's `bounds`
points at `CARGO_MEASUREMENT_BOUNDS` — no bound is spelled out at a call site:

```ts
const cargoWeightResult = parseCargoNumber(
  cargoWeightKgInput,
  CARGO_WEIGHT_FIELD,
);
const cargoLengthResult = parseCargoNumber(
  cargoLengthMInput,
  CARGO_LENGTH_FIELD,
);
const cargoWidthResult = parseCargoNumber(cargoWidthMInput, CARGO_WIDTH_FIELD);
const cargoHeightResult = parseCargoNumber(
  cargoHeightMInput,
  CARGO_HEIGHT_FIELD,
);

const cargoDimensionsValid =
  "data" in cargoWeightResult &&
  "data" in cargoLengthResult &&
  "data" in cargoWidthResult &&
  "data" in cargoHeightResult;

// See §3: both-or-neither, end strictly after start.
const pickupWindowStartDateTime =
  scheduledDate && pickupWindowStartTime
    ? combineDateAndTime(scheduledDate, pickupWindowStartTime)
    : null;
const pickupWindowEndDateTime =
  scheduledDate && pickupWindowEndTime
    ? combineDateAndTime(scheduledDate, pickupWindowEndTime)
    : null;
const pickupWindowValid =
  (pickupWindowStartDateTime === null && pickupWindowEndDateTime === null) ||
  (pickupWindowStartDateTime !== null &&
    pickupWindowEndDateTime !== null &&
    pickupWindowEndDateTime.getTime() > pickupWindowStartDateTime.getTime());

const deliveryDeadlineDateTime =
  deliveryDeadlineDate && deliveryDeadlineTime
    ? combineDateAndTime(deliveryDeadlineDate, deliveryDeadlineTime)
    : null;
const deadlineFloor = pickupWindowEndDateTime ?? scheduledDateTime;
const deliveryDeadlineValid =
  deliveryDeadlineDateTime === null ||
  (deadlineFloor !== null &&
    deliveryDeadlineDateTime.getTime() > deadlineFloor.getTime());

const canSubmit =
  !submitting &&
  selectedVehicleType !== null &&
  estimate !== null &&
  scheduledDateTime !== null &&
  cargoDimensionsValid &&
  pickupWindowValid &&
  deliveryDeadlineValid;
```

(This replaces the existing `canSubmit` assignment in place — the first four
conjuncts are unchanged from today's implementation, the last three are new.)

### 10. Submit payload

Extend the `POST /api/orders` body in `handleSubmit` with the new fields.
Only send parsed, valid values — `handleSubmit` already returns early via
`canSubmit` gating the button, but `handleSubmit` itself re-derives what it
sends rather than trusting stale render-time booleans, matching how the rest
of this function is written:

```ts
body: JSON.stringify({
  // ...existing fields unchanged...
  cargoWeightKg: "data" in cargoWeightResult ? cargoWeightResult.data : null,
  cargoLengthM: "data" in cargoLengthResult ? cargoLengthResult.data : null,
  cargoWidthM: "data" in cargoWidthResult ? cargoWidthResult.data : null,
  cargoHeightM: "data" in cargoHeightResult ? cargoHeightResult.data : null,
  packagingDescription: packagingDescription.trim() || undefined,
  itemQuantity: itemQuantity.trim() || undefined,
  handlingTags,
  pickupWindowStart: pickupWindowStartDateTime?.toISOString(),
  pickupWindowEnd: pickupWindowEndDateTime?.toISOString(),
  deliveryDeadline: deliveryDeadlineDateTime?.toISOString(),
}),
```

`JSON.stringify` drops `undefined` keys entirely — the same convention
`stopContactPayload` already relies on in this file for "nothing was filled
in" — so an unset optional field is an omitted key, not an explicit `null`.
The four required numbers are sent as `null` rather than omitted only in the
defensive case where `handleSubmit` somehow fires with `canSubmit` false (the
existing `scheduledDateTime` guard at the top of `handleSubmit` is the
precedent for this defensive style); in the normal path gated by `canSubmit`
they are always `"data"` results.

Note: `POST /api/orders` does not parse or persist these fields until
task-05-create-order-persistence.md lands. Until then the server ignores
unknown body keys (confirm this against the current implementation of
`parseCreateOrderBody`, which reads named fields off the parsed JSON and does
not reject a body for carrying extra ones) — so shipping this task ahead of or
in parallel with task-05 is safe. Both are Wave 2 and may be implemented in
either order or in parallel.

## Acceptance Criteria

- [ ] A new `StepCard` titled "Cargo details" renders with `step={6}`,
      positioned after "Recommended vehicle" (step 5) and before "Additional
      details", which is renumbered to `step={7}`.
- [ ] The new step is disabled exactly when `vehicleChosenStepsEnabled` is
      false, with `disabledReason={CHOOSE_VEHICLE_FIRST}`, matching steps 6/7
      and the Service level card.
- [ ] Total weight, length, width and height are required: `canSubmit` is
      `false` while any of the four is empty or outside its documented
      min/max, and each shows an inline error naming the fix once the client
      has left it invalid.
- [ ] Packaging description, item quantity, handling tags, pickup window and
      delivery deadline can all be left empty and the form still submits — and
      the resulting request is one `POST /api/orders` accepts. The endpoint
      (task-05) treats all five as optional; if it ever requires one, this
      criterion is the one that has been broken.
- [ ] No numeric bound appears as a literal in `booking-form.tsx`: every
      `min`/`max` reaches the field descriptors, the `<Input>` attributes, the
      parser and the helper copy from `CARGO_MEASUREMENT_BOUNDS`, the same table
      `POST /api/orders` reads. A width of `5` is rejected by both sides, not
      accepted here and refused there.
- [ ] Handling tags render as six independently toggleable chips in enum
      order, `aria-pressed` reflecting selection state, using this page's own
      landing token utilities — no `oklch(...)`, hex literal, or `dark:`
      utility appears in the diff.
- [ ] Selecting `COLD_CHAIN` while `bodyType !== "REFRIGERATED"` shows a
      `role="status"` warning naming the currently-chosen body type; it does
      not block submission and does not change `bodyType` or the tag
      selection itself.
- [ ] Selecting `HAZMAT` shows a permanent `role="status"` notice referencing
      `specs/driver-load-board/action-required.md`.
- [ ] A pickup window with only one of start/end set, or an end not strictly
      after its start, is rejected (`canSubmit` false / inline error); a fully
      empty window is accepted.
- [ ] A delivery deadline not strictly after the pickup window's end (or, with
      no window declared, not strictly after `scheduledDateTime`) is rejected;
      an empty deadline is accepted.
- [ ] `POST /api/orders`'s request body carries `cargoWeightKg`,
      `cargoLengthM`, `cargoWidthM`, `cargoHeightM`, `handlingTags` (always,
      `[]` when nothing is selected), and `packagingDescription`,
      `itemQuantity`, `pickupWindowStart`, `pickupWindowEnd`,
      `deliveryDeadline` only when set (omitted, not sent as empty string /
      null, when blank).
- [ ] `src/lib/cargo.ts` exports `CARGO_HANDLING_TAG_LABELS` covering all six
      `CargoHandlingTag` values, added without introducing a runtime
      `@prisma/client` import into that file (the existing type-only import
      pattern is extended, not replaced).
- [ ] `canCalculate` and the request body sent to `/api/pricing/estimate` are
      byte-for-byte unchanged — no new field reaches that endpoint.
- [ ] `src/lib/pricing.ts` has no diff.
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

**Out of scope for this task** (also out of scope for the whole
`driver-load-board` feature per `specs/driver-load-board/requirements.md`'s
Non-Goals):

- No changes to `src/lib/pricing.ts`, `POST /api/pricing/estimate`, or the
  fare breakdown rendered in this form. Cargo weight and dimensions are
  declared data; they do not feed the quote, now or as part of this task.
- No cargo photo upload. The board's detail drawer (a later task) keeps its
  three dashed placeholder tiles; there is nowhere in this form to feed them
  from and this task does not add one.
- No multi-stop. This form still collects exactly one pickup and one dropoff;
  the new fields describe one load travelling between them.
- No server-side changes. `src/app/api/orders/route.ts` is
  task-05-create-order-persistence.md's file, not this one's — this task's
  Acceptance Criteria stop at what the client sends, not at what the server
  does with it.
- No changes to `src/app/api/orders/[id]/accept/route.ts` or any driver-facing
  surface — those read `Order` rows this task's fields end up on, but this
  task does not touch anything downstream of `POST /api/orders`.

**House conventions this task follows:**

- No validation library anywhere in this codebase — Zod is not a dependency
  and must not become one. The hand-rolled `{ data } | { error }` parse shape
  is the existing server-side pattern (`parseCreateOrderBody`); this task
  applies the same shape client-side for the four numeric fields, consistent
  with, not a copy of, that convention — the client form otherwise validates
  with plain booleans and inline text (see `canCalculate`/`canSubmit` and the
  `availableTimeSlots`/`scheduledTime` handling already in this file), and
  this task's new optional-field checks (`pickupWindowValid`,
  `deliveryDeadlineValid`) follow that plainer existing style rather than
  introducing the parse-result shape everywhere.
- Heavy WHY-focused doc comments throughout — every new constant, state
  variable and non-obvious predicate in this file already carries one; match
  that density, not the file's oldest, thinner comments.
- Tailwind v4 + shadcn, landing tokens only on this page (`bg-ink`,
  `bg-surface`, `text-paper`, `text-muted`, `border-line`, `accent`) — see §4
  above for why the design handoff's literal `oklch(...)` values must not be
  copied onto this page.
- `pnpm check` must pass before this task is considered done.
