"use client";

/**
 * Step 2 — fleet composition.
 *
 * Where a company declares *how many* vehicles it runs in each
 * (cargo body type × vehicle class) cell. It collects no plates and no
 * specifications: it builds the list that step 3 then fills in, one row per
 * declared vehicle.
 *
 * Fifteen cells are rendered — all five classes under each of the three body
 * types — but only eight are usable. The other seven have no backing
 * `VehicleTypeSpec` and render *locked*, at reduced emphasis with a short note
 * where the stepper would be, rather than falling back to a near-miss spec that
 * would misprice orders. Which cells lock is never hard-coded here: it is
 * `resolveVehicleTypeSpecCode(...) === null`, so `task-04`'s map stays the one
 * place the truth lives and this UI cannot disagree with the resolver.
 *
 * The only thing this step writes is `draft.fleet.counts`. It never touches
 * `draft.vehicles` — generating, trimming and renumbering those rows belongs to
 * step 3, which does it on entry so the company sees what changed. Because
 * `updateDraft` merges at the section level, writing `{ fleet: { counts } }`
 * leaves the vehicles array byte-identical, which is exactly what preserves
 * already-specified vehicles when a count changes.
 */

import { useMemo, useState } from "react";

import {
  FLEET_SCREENS,
  useFleetDraft,
} from "@/components/fleet-onboarding/fleet-draft-context";
import {
  BODY_TYPES,
  findBodyType,
  resolveVehicleTypeSpecCode,
  VEHICLE_CLASSES,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
import {
  FLEET_MAX_PER_CELL,
  FLEET_MAX_VEHICLES,
  FLEET_MIN_VEHICLES,
  type FleetDraftChassisType,
} from "@/lib/fleet-onboarding/draft-schema";

/**
 * The key `draft.fleet.counts` is indexed by. Also the key step 3 groups its
 * generated vehicle rows under and the key the shell's rail sums over, which is
 * why the format is load-bearing rather than an implementation detail: both
 * halves are the enum values the draft stores (never display names) and the
 * separator is a single colon.
 */
function fleetKey(
  chassisType: FleetDraftChassisType,
  classId: VehicleClassId,
): string {
  return `${chassisType}:${classId}`;
}

/**
 * Why a cell is locked, when the reason is more specific than "no spec backs
 * it". Which cells lock is `task-04`'s `specCodeByChassis`, not this map — this
 * only supplies copy, and anything not listed falls back to the default note.
 */
const LOCK_NOTES: Record<string, string> = {
  "OPEN_CHASSIS:SMALL_VAN": "Vans are not sold as flatbeds.",
  "OPEN_CHASSIS:LARGE_VAN": "Vans are not sold as flatbeds.",
};

const DEFAULT_LOCK_NOTE = "Not offered yet.";

const INTRO_COPY =
  "Set how many vehicles you run in each combination. You fill in plates and specifications for each one in the next step — this just builds the list.";

/**
 * The message shown when the declared total breaks one of the two fleet-size
 * bounds, or `undefined` when it is fine.
 *
 * The over-cap branch is unreachable by clicking, since every plus button
 * disables once the total reaches `FLEET_MAX_VEHICLES` — it is kept because a
 * draft restored from another device (or written before the cap existed) can
 * still exceed it, and because submit re-checks the same bound server-side and
 * must be able to raise the same sentence. A rule enforced in one place is a
 * rule that will eventually be bypassed.
 */
function fleetProblem(total: number): string | undefined {
  if (total < FLEET_MIN_VEHICLES) {
    return "A business account needs at least two vehicles. Use the individual driver flow for a single vehicle.";
  }
  if (total > FLEET_MAX_VEHICLES) {
    return "A single application can cover at most 40 vehicles. Contact operations to register a larger fleet.";
  }
  return undefined;
}

/** The design's `groupTotals`: "none" at zero, otherwise a pluralised count. */
function vehicleCountLabel(count: number): string {
  if (count === 0) return "none";
  return `${count} vehicle${count === 1 ? "" : "s"}`;
}

export function Step2FleetComposition() {
  const { draft, updateDraft, goToStep, showToast } = useFleetDraft();

  /** The count map itself — nested one level inside the `fleet` section. */
  const counts = useMemo(
    () => draft.fleet?.counts ?? {},
    [draft.fleet?.counts],
  );

  /**
   * Whether the totals rule has already failed a Continue. Same "quiet until
   * the first Continue" contract every other step uses.
   */
  const [touched, setTouched] = useState(false);

  // The same sum the shell's rail computes for its "Declared" tally. Zero
  // counts are deleted rather than stored, so this needs no filtering.
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const problem = fleetProblem(total);

  function bump(
    chassisType: FleetDraftChassisType,
    classId: VehicleClassId,
    delta: number,
  ) {
    const key = fleetKey(chassisType, classId);
    const next: Record<string, number> = { ...counts };
    const value = Math.max(
      0,
      Math.min(FLEET_MAX_PER_CELL, (next[key] ?? 0) + delta),
    );

    // Zero is absence, not a stored 0 — matching the design, and keeping the
    // grand total a plain sum over the values.
    if (value === 0) delete next[key];
    else next[key] = value;

    // Only the one bumped key ever changes: the map is copied, one entry is
    // edited, and it is sent inside a fresh `fleet` section. Rebuilding the
    // counts from the full body × class grid (or normalising absent cells to
    // zero) would make every group look changed to step 3's conservative diff,
    // which preserves specified vehicles by keeping the first n of each group.
    //
    // NESTED. `fleet` is a section object whose only member is `counts`; the
    // count map is never the section itself. And `vehicles` is deliberately not
    // part of this patch, so the section-level merge leaves it untouched.
    updateDraft({ fleet: { counts: next } });
  }

  function handleContinue() {
    if (problem !== undefined) {
      setTouched(true);
      // Table steps put the field message itself in the toast, rather than the
      // form steps' generic "Fix the highlighted fields to continue." — there
      // is only one rule on this screen and no field to highlight.
      showToast(problem, "error");
      return;
    }
    goToStep(FLEET_SCREENS.vehicles);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[640px] text-[13.5px] leading-[1.5] text-muted-foreground">
        {INTRO_COPY}
      </p>

      {BODY_TYPES.map((body) => (
        <BodyPanel
          key={body.id}
          bodyId={body.id}
          counts={counts}
          fleetTotal={total}
          onBump={bump}
        />
      ))}

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
        <p className="text-[13.5px] text-muted-foreground">
          {total > 0
            ? "Vehicles to specify in the next step"
            : "Nothing declared yet — add at least two vehicles"}
        </p>
        <p className="font-price text-[19px] font-semibold tracking-[-0.01em]">
          {total}
        </p>
      </div>

      {touched && problem !== undefined ? (
        <p className="text-xs text-destructive">{problem}</p>
      ) : null}

      <div className="mt-4 flex items-center gap-3.5 border-t border-border pt-[22px]">
        {/* `text-white` here is correct in both themes and must not be
            "fixed" into `text-primary-foreground` or similar. The ground it
            sits on is `--onboarding-accent`, which globals.css pins to the same
            #ff5a1f in light and dark by design — the brand orange is not a
            theme colour — so the only legible foreground is white in both, and
            a token that flips would turn this button's label near-black on
            orange the moment dark mode is on. */}
        <button
          type="button"
          onClick={handleContinue}
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/**
 * Chrome shared by the minus and plus buttons; only the rounding differs.
 *
 * These are bare `<button>`s rather than the `ui/button` primitive, so none of
 * that component's `dark:bg-input/30` / `dark:hover:bg-muted/50` overrides
 * apply here and there is nothing for these classes to fight. Worth knowing
 * that the segmented control is `bg-card` sitting on a `bg-card` row in *both*
 * themes — it is `border-border` alone that draws it, which is a 10%-white
 * hairline in dark rather than the solid grey of light mode. That is faint but
 * deliberate and matches every other shadcn-built control on this surface;
 * giving the steppers their own darker fill would make them the loudest thing
 * in a panel whose subject is the artwork and the counts.
 */
const STEPPER_BUTTON_CLASS_NAME =
  "size-8 cursor-pointer border border-border bg-card text-base text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The one thing this step adds to the shared body types: a 104px side view,
 * authored here (the three components are declared at the foot of this file).
 *
 * `step-3-chassis-class.tsx` has richer versions of the same three silhouettes
 * at the same viewBox, deliberately not reused: they are module-private and
 * tuned for a much larger card, carrying extra body seams, mirrors and marker
 * lamps that turn to mush at this size.
 */
const SIDE_VIEWS: Record<FleetDraftChassisType, () => React.ReactElement> = {
  DRY_BOX: DryBoxSideView,
  REFRIGERATED: RefrigeratedSideView,
  OPEN_CHASSIS: OpenChassisSideView,
};

type BodyPanelProps = {
  /** The `ChassisType` enum value the draft stores, not a display name. */
  bodyId: FleetDraftChassisType;
  counts: Record<string, number>;
  /**
   * The whole application's declared total. The cap is on the application, not
   * on a cell, so a row's plus button has to know the grand total to block the
   * forty-first vehicle wherever it would be added.
   */
  fleetTotal: number;
  onBump: (
    chassisType: FleetDraftChassisType,
    classId: VehicleClassId,
    delta: number,
  ) => void;
};

/**
 * One cargo body type's panel: header (side view, label, description, subtotal)
 * over one row per vehicle class.
 *
 * Takes the body's id and resolves its own copy through `findBodyType` rather
 * than being handed the record, so the label and description it renders come
 * from the shared taxonomy and this file holds no copy of the three names.
 */
function BodyPanel({ bodyId, counts, fleetTotal, onBump }: BodyPanelProps) {
  const body = findBodyType(bodyId);
  const SideView = SIDE_VIEWS[bodyId];

  const subtotal = VEHICLE_CLASSES.reduce(
    (sum, cls) => sum + (counts[fleetKey(bodyId, cls.id)] ?? 0),
    0,
  );

  return (
    <section className="overflow-hidden rounded-[14px] border border-border bg-card">
      {/* `bg-muted/40` stands in for the design's #fbfbfb, which has no token.
          It is a token rather than that literal precisely so it survives the
          theme: 40% of `--muted` over the section's `bg-card` lands a hair
          below white in light mode, and a hair *above* the near-black card in
          dark, which is the same "header sits slightly apart from the rows"
          reading in both. The literal would have been a white band. */}
      <header className="flex items-center gap-3.5 border-b border-border bg-muted/40 px-4 py-3">
        <SideView />
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold">{body.label}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {body.description}
          </p>
        </div>
        <p className="font-price text-[12.5px] font-semibold text-muted-foreground">
          {vehicleCountLabel(subtotal)}
        </p>
      </header>

      {/* All five classes render in every panel, seven of the fifteen cells
          locked. The design's own Open Chassis panel drops the two van rows
          entirely; showing them locked instead is a deliberate deviation, so
          that the locked cells are literally the unbacked ones and a company
          reading the panel learns *why* a combination is unavailable. */}
      {VEHICLE_CLASSES.map((cls) => {
        const key = fleetKey(bodyId, cls.id);
        const count = counts[key] ?? 0;
        // `null` — no spec in the catalogue backs this pair — is the one and
        // only reason a cell locks. Derived, never listed.
        const specCode = resolveVehicleTypeSpecCode(cls.id, bodyId);

        if (specCode === null) {
          return (
            <div
              key={cls.id}
              aria-disabled="true"
              className="flex items-center gap-3.5 border-b border-border bg-card px-4 py-[11px] opacity-60 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-muted-foreground">
                  {cls.name}
                </p>
                <p className="mt-px text-[11.5px] text-muted-foreground">
                  {cls.capacityLine}
                </p>
              </div>
              <span className="font-price shrink-0 rounded-[5px] bg-muted px-[7px] py-[3px] text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground">
                {cls.chip}
              </span>
              <p className="shrink-0 text-right text-[11.5px] text-muted-foreground">
                {LOCK_NOTES[key] ?? DEFAULT_LOCK_NOTE}
              </p>
            </div>
          );
        }

        return (
          <div
            key={cls.id}
            className={`flex items-center gap-3.5 border-b border-border px-4 py-[11px] last:border-b-0 ${
              count > 0
                ? // The "this row has vehicles in it" tint. 3% of the brand
                  // orange over a white card is a just-perceptible warm wash,
                  // which is the whole intent — the count and the bolded class
                  // name carry the state, this only groups the declared rows
                  // when the eye scans the panel. Over the dark card the same
                  // 3% is *below* perception rather than at its edge, because
                  // a light tint on a dark ground has far less contrast to
                  // spend, so dark mode gets a stronger alpha to buy back the
                  // identical amount of separation. The two values are not a
                  // light/dark pair of the same wash; they are two alphas
                  // chosen to produce the same effect.
                  "bg-onboarding-accent/[0.03] dark:bg-onboarding-accent/[0.08]"
                : "bg-card"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p
                className={`text-[13.5px] font-semibold ${
                  count > 0 ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {cls.name}
              </p>
              <p className="mt-px text-[11.5px] text-muted-foreground">
                {cls.capacityLine}
              </p>
            </div>
            <span className="font-price shrink-0 rounded-[5px] bg-muted px-[7px] py-[3px] text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground">
              {cls.chip}
            </span>
            <div
              role="group"
              aria-label={`${cls.name} · ${body.label}`}
              className="flex shrink-0 items-center"
            >
              <button
                type="button"
                aria-label="Remove one"
                disabled={count === 0}
                onClick={() => onBump(bodyId, cls.id, -1)}
                className={`${STEPPER_BUTTON_CLASS_NAME} rounded-l-lg`}
              >
                −
              </button>
              <span
                aria-live="polite"
                className={`flex h-8 w-11 items-center justify-center border-y border-border bg-card font-price text-sm font-semibold ${
                  count > 0 ? "text-onboarding-accent" : "text-muted-foreground"
                }`}
              >
                {count}
              </span>
              <button
                type="button"
                aria-label="Add one"
                disabled={
                  count === FLEET_MAX_PER_CELL ||
                  fleetTotal >= FLEET_MAX_VEHICLES
                }
                onClick={() => onBump(bodyId, cls.id, 1)}
                className={`${STEPPER_BUTTON_CLASS_NAME} rounded-r-lg`}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/**
 * The one palette the three side views draw from.
 *
 * Every shape below reads its colour through a `var(--truck-*)` custom property
 * instead of carrying a literal, and the properties are declared here as
 * Tailwind arbitrary-property utilities with `dark:` counterparts. Hanging them
 * off the shared `<svg>` class means a single list governs all three drawings
 * and each shape keeps its *material* name at the point of use:
 * `fill="var(--truck-tyre)"` says what the shape is, where `fill="oklch(0.26 0
 * 0)"` only said how dark it happened to be.
 *
 * The two alternatives were both rejected. Threading a second, dark set of
 * literals through the shapes one by one splits the palette across three
 * components, and they would drift the first time somebody edited one of them.
 * A `<style>` block would keep the palette in one place but put it outside
 * Tailwind's variant system, so the dark half would need its own hand-written
 * `.dark` selector duplicating `@custom-variant dark`.
 *
 * Every light value is byte-identical to the literal it replaced, so light mode
 * is pixel-unchanged. The dark values are picked against the card these sit on
 * (`--card: oklch(0.205 0 0)`) so that no material sinks into it. That means
 * several of them deliberately *invert* their relationship to their ground
 * rather than preserving it: chassis, tyres and seams are the darkest marks in
 * the light drawing and the lighter ones in the dark drawing, because the
 * ground itself went from near-white to near-black. What is preserved is the
 * ordering *within* a material group, which is what makes the drawing readable
 * — hubs stay lighter than the tyres they sit in, the vent grille stays lighter
 * than the cooling unit it cuts across, the box stays a shade darker than the
 * cab shell.
 *
 * `--truck-seam` is split in two because the light drawings already used two
 * near-identical greys for the same material — `oklch(0.88 0 0)` for the box's
 * roof seam and panel division, `oklch(0.86 0 0)` for the open deck's side rail
 * and stake posts. Collapsing them to one value would have been a light-mode
 * pixel change, which this pass is not allowed to make, so both survive as
 * named siblings and converge on a single dark value.
 *
 * These names and values are shared verbatim with the driver wizard's
 * `step-3-chassis-class.tsx` and `step-3c-technical-details.tsx`, which draw
 * the same three vehicles at a larger size. A change here belongs there too.
 */
const TRUCK_PALETTE_CLASS_NAME =
  "[--truck-outline:oklch(0.7_0_0)] dark:[--truck-outline:oklch(0.62_0_0)] " +
  "[--truck-body:#fbfbfb] dark:[--truck-body:oklch(0.45_0_0)] " +
  "[--truck-box:#f7f7f8] dark:[--truck-box:oklch(0.40_0_0)] " +
  "[--truck-unit:#eceef0] dark:[--truck-unit:oklch(0.38_0_0)] " +
  "[--truck-glass:#dfe4e8] dark:[--truck-glass:oklch(0.55_0.03_240)] " +
  "[--truck-seam:oklch(0.88_0_0)] dark:[--truck-seam:oklch(0.55_0_0)] " +
  "[--truck-seam-deck:oklch(0.86_0_0)] dark:[--truck-seam-deck:oklch(0.55_0_0)] " +
  "[--truck-vent:oklch(0.76_0_0)] dark:[--truck-vent:oklch(0.58_0_0)] " +
  "[--truck-chassis:oklch(0.42_0_0)] dark:[--truck-chassis:oklch(0.62_0_0)] " +
  "[--truck-tyre:oklch(0.26_0_0)] dark:[--truck-tyre:oklch(0.32_0_0)] " +
  "[--truck-hub:oklch(0.84_0_0)] dark:[--truck-hub:oklch(0.58_0_0)] " +
  "[--truck-cold:#2f5fb8] dark:[--truck-cold:#7aa5e8]";

const SIDE_VIEW_CLASS_NAME = `h-auto w-[104px] shrink-0 ${TRUCK_PALETTE_CLASS_NAME}`;

/** The cab shell and its side window, shared by all three views: the body
 *  behind them is the only part that differs. */
const CAB_SHELL_PATH =
  "M240 118 V62 Q240 53 249 51 L287 43 Q295 43 300 49 L321 76 Q331 82 331 97 V118 Z";
const CAB_WINDOW_PATH = "M251 63 L285 56 V78 H251 Z";

function DryBoxSideView() {
  return (
    <svg
      viewBox="0 0 360 150"
      role="img"
      aria-label="Dry box truck"
      className={SIDE_VIEW_CLASS_NAME}
    >
      <g
        stroke="var(--truck-outline)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={CAB_SHELL_PATH} fill="var(--truck-body)" />
        <path d={CAB_WINDOW_PATH} fill="var(--truck-glass)" />
        {/* A tall, fully enclosed box over the rear two-thirds. */}
        <path d="M30 30 H240 V118 H30 Z" fill="var(--truck-box)" />
      </g>
      {/* Roof seam and one vertical panel division. */}
      <g stroke="var(--truck-seam)" strokeWidth="1.4">
        <path d="M30 37 H240 M150 30 V118" />
      </g>
      <path d="M26 118 H332 V128 H26 Z" fill="var(--truck-chassis)" />
      <g fill="var(--truck-tyre)">
        <circle cx="96" cy="128" r="18" />
        <circle cx="272" cy="128" r="19" />
      </g>
      <g fill="var(--truck-hub)">
        <circle cx="96" cy="128" r="7.5" />
        <circle cx="272" cy="128" r="8" />
      </g>
    </svg>
  );
}

function RefrigeratedSideView() {
  return (
    <svg
      viewBox="0 0 360 150"
      role="img"
      aria-label="Refrigerated truck"
      className={SIDE_VIEW_CLASS_NAME}
    >
      <g
        stroke="var(--truck-outline)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={CAB_SHELL_PATH} fill="var(--truck-body)" />
        <path d={CAB_WINDOW_PATH} fill="var(--truck-glass)" />
        <path d="M30 30 H240 V118 H30 Z" fill="var(--truck-box)" />
        {/* The roof-mounted cooling unit, at the cab end of the box. */}
        <path
          d="M198 8 H242 Q248 8 248 14 V30 H192 V14 Q192 8 198 8 Z"
          fill="var(--truck-unit)"
        />
      </g>
      {/* Cooling-unit grille. */}
      <g stroke="var(--truck-vent)" strokeWidth="1.4">
        <path d="M200 16 H240 M200 24 H240" />
      </g>
      {/* Roof seam only — the snowflake occupies the dry box's panel division. */}
      <g stroke="var(--truck-seam)" strokeWidth="1.4">
        <path d="M30 37 H240" />
      </g>
      <path d="M26 118 H332 V128 H26 Z" fill="var(--truck-chassis)" />
      <g fill="var(--truck-tyre)">
        <circle cx="96" cy="128" r="18" />
        <circle cx="272" cy="128" r="19" />
      </g>
      <g fill="var(--truck-hub)">
        <circle cx="96" cy="128" r="7.5" />
        <circle cx="272" cy="128" r="8" />
      </g>
      {/* Snowflake on the body's side panel. */}
      <g
        stroke="var(--truck-cold)"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M96 60 v24 M85 66 l22 12 M85 78 l22 -12" />
      </g>
    </svg>
  );
}

function OpenChassisSideView() {
  return (
    <svg
      viewBox="0 0 360 150"
      role="img"
      aria-label="Flatbed truck with drop sides"
      className={SIDE_VIEW_CLASS_NAME}
    >
      <g
        stroke="var(--truck-outline)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={CAB_SHELL_PATH} fill="var(--truck-body)" />
        <path d={CAB_WINDOW_PATH} fill="var(--truck-glass)" />
        {/* No roof: a low deck with short drop sides, over the lower third of
            the body area. */}
        <path d="M30 74 H240 V106 H30 Z" fill="var(--truck-box)" />
      </g>
      {/* Side rail and two stake posts. */}
      <g stroke="var(--truck-seam-deck)" strokeWidth="1.4">
        <path d="M30 90 H240 M110 74 V106 M170 74 V106" />
      </g>
      {/* The whole vehicle sits lower, so the rail and wheels move down too. */}
      <path d="M26 106 H332 V118 H26 Z" fill="var(--truck-chassis)" />
      <g fill="var(--truck-tyre)">
        <circle cx="96" cy="126" r="18" />
        <circle cx="272" cy="126" r="19" />
      </g>
      <g fill="var(--truck-hub)">
        <circle cx="96" cy="126" r="7.5" />
        <circle cx="272" cy="126" r="8" />
      </g>
    </svg>
  );
}
