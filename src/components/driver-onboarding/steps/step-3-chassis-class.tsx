"use client";

/**
 * Step 3a/3b — cargo body type, then vehicle class. Both sub-screens live in
 * this one component; the shell routes to it on
 * `ONBOARDING_SCREENS.vehicleBodyAndClass`, and its own Continue hands off to
 * `ONBOARDING_SCREENS.vehicleTechnical` for 3c.
 *
 * The two sub-screens are one component because they share one screen number
 * (see the numbering scheme at the top of `onboarding-wizard-shell.tsx`) and
 * because 3b is meaningless without 3a's answer: which classes are even
 * offered depends on the body type just chosen. The switch between them is
 * plain local state, so it is deliberately session-local — a driver who leaves
 * on 3b and comes back resumes at 3a, the same trade the shell documents for
 * 3c.
 *
 * A class card is locked for either of two independent reasons, rendered
 * identically so they read as one "locked" language:
 *
 *  1. The driver's licence (step 2) doesn't list the class's required
 *     category — the design's own rule.
 *  2. This codebase's `VehicleTypeSpec` catalogue has no spec for the
 *     (class, body type) pair — new in this feature, because unlike the
 *     design's prototype we resolve every class back to a real seeded spec
 *     (`vehicle-classes.ts`) rather than to a made-up one.
 */

import { useEffect, useState } from "react";

import {
  ONBOARDING_SCREENS,
  useOnboardingDraft,
} from "@/components/driver-onboarding/onboarding-draft-context";
import type {
  OnboardingDraftChassisType,
  OnboardingDraftLicenceCategory,
  OnboardingDraftV1,
} from "@/lib/driver-onboarding/draft-schema";
import {
  isClassLockedByLicence,
  resolveVehicleTypeSpecCode,
  VEHICLE_CLASSES,
  type VehicleClass,
} from "@/lib/driver-onboarding/vehicle-classes";

/** The vehicle section of the draft, as this step reads and rewrites it. */
type DraftVehicle = NonNullable<OnboardingDraftV1["vehicle"]>;

/** The copy shown on, and raised by, a locked class card. */
type ClassLock = {
  /** The red line rendered on the card itself. */
  note: string;
  /** The toast raised when the locked card is clicked anyway. */
  flash: string;
};

/**
 * Body types in the design's card order, each with the noun phrase used by
 * 3b's availability-lock line ("not offered as a refrigerated vehicle yet").
 * Keyed by the `ChassisType` enum values the draft stores.
 */
const CHASSIS_OPTIONS: {
  id: OnboardingDraftChassisType;
  name: string;
  description: string;
  Silhouette: () => React.ReactElement;
}[] = [
  {
    id: "DRY_BOX",
    name: "Dry Box",
    description: "Enclosed rigid box. General palletised and boxed cargo.",
    Silhouette: DryBoxSilhouette,
  },
  {
    id: "REFRIGERATED",
    name: "Refrigerated Vehicle",
    description:
      "Temperature-controlled body, −20 °C to +8 °C. Requires a valid cooling unit service record.",
    Silhouette: RefrigeratedSilhouette,
  },
  {
    id: "OPEN_CHASSIS",
    name: "Open Chassis",
    description:
      "Flatbed or curtain-side with drop sides. Oversized, construction and machinery loads.",
    Silhouette: OpenChassisSilhouette,
  },
];

/**
 * How each body type is named mid-sentence. A `Record` rather than a lookup
 * against `CHASSIS_OPTIONS` so every enum value is required to have one and a
 * missing case is a type error, not a runtime fallback.
 */
const CHASSIS_LOCK_LABELS: Record<OnboardingDraftChassisType, string> = {
  DRY_BOX: "a dry box",
  REFRIGERATED: "a refrigerated vehicle",
  OPEN_CHASSIS: "an open chassis",
};

/** The toast every step raises when Continue is pressed on an invalid screen. */
const VALIDATION_TOAST = "Fix the highlighted fields to continue.";

const BODY_REQUIRED_MESSAGE = "Choose a cargo body type.";
const CLASS_REQUIRED_MESSAGE = "Choose the vehicle class.";

/**
 * The `GET /api/vehicle-types` fields this step needs — the seeded
 * `VehicleTypeSpec` values that become the starting point for step 3c's
 * editable payload and cargo-hold fields. The endpoint returns more per entry
 * (label, category, loading access, pricing rule); anything not listed here is
 * ignored.
 *
 * Declared locally rather than reusing `VehicleTypeSelect`'s exported
 * `VehicleTypeOption`, which stops at `maxPayloadKg` and has no cargo
 * dimensions: widening a type that four unrelated vehicle forms depend on, to
 * add three fields only this step reads, would be the more invasive change.
 */
type VehicleTypeDefaults = {
  code: string;
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
};

/** The spec-derived values seeded into the draft when a class is chosen. */
type SeededSpecValues = Pick<
  DraftVehicle,
  "payloadKg" | "cargoLengthM" | "cargoWidthM" | "cargoHeightM"
>;

/**
 * Loads the vehicle-type catalogue, following `VehicleTypeSelect`'s pattern:
 * a `fetch` of the public `GET /api/vehicle-types` on mount, aborted if the
 * component unmounts first.
 *
 * A failure is deliberately silent and leaves the list empty. These values are
 * only a head start for step 3c's fields, which stay editable and required
 * either way — so a failed fetch costs the driver some typing, and is not
 * worth an error banner on a screen whose actual job (picking a class) is
 * unaffected.
 */
function useVehicleTypeDefaults(): VehicleTypeDefaults[] {
  const [specs, setSpecs] = useState<VehicleTypeDefaults[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadVehicleTypes() {
      try {
        const response = await fetch("/api/vehicle-types", {
          signal: controller.signal,
        });

        if (!response.ok) return;

        setSpecs((await response.json()) as VehicleTypeDefaults[]);
      } catch {
        // An abort lands here too, by which point there is nothing to update.
      }
    }

    void loadVehicleTypes();

    return () => {
      controller.abort();
    };
  }, []);

  return specs;
}

/**
 * Whether a spec value is usable as a prefilled default. `cargoHeightM` is
 * `0` for `FLATBED_TRUCK` — the catalogue's way of saying "open bed, no cargo
 * box", not a real measurement — and step 3c requires every dimension to be
 * greater than zero, so seeding that `0` would hand the driver a value their
 * own next screen rejects. Non-positive and non-finite values are therefore
 * left unset for the driver to fill in.
 */
function isSeedableValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Which lock, if any, applies to a class right now.
 *
 * Order matters: when both locks apply the licence one wins, because it is the
 * actionable one — changing the body type alone would still leave the class
 * out of reach.
 */
function resolveClassLock(
  vehicleClass: VehicleClass,
  heldCategories: OnboardingDraftLicenceCategory[],
  chassisType: OnboardingDraftChassisType,
): ClassLock | null {
  if (isClassLockedByLicence(vehicleClass.id, heldCategories)) {
    const category = vehicleClass.requiredLicenceCategory;
    return {
      note: `Locked — your licence does not list category ${category}.`,
      flash: `Add category ${category} in step 2 to drive this class.`,
    };
  }

  if (resolveVehicleTypeSpecCode(vehicleClass.id, chassisType) === null) {
    return {
      note: `Locked — not offered as ${CHASSIS_LOCK_LABELS[chassisType]} yet.`,
      flash:
        "Choose a different body type in the previous screen to unlock this class.",
    };
  }

  return null;
}

export function Step3ChassisClass() {
  const { draft, updateDraft, goToStep, showToast } = useOnboardingDraft();
  const vehicleTypeDefaults = useVehicleTypeDefaults();

  // Which of the two sub-screens is showing. Always starts at 3a: 3b's lock
  // states are computed from 3a's answer, so the body type has to be confirmed
  // before the class list means anything.
  const [phase, setPhase] = useState<"body" | "class">("body");
  // Validation is shown on Continue, never on selection — the same rule the
  // rest of the wizard follows.
  const [bodyError, setBodyError] = useState(false);
  const [classError, setClassError] = useState(false);

  const vehicle: DraftVehicle = draft.vehicle ?? {};
  const chassisType = vehicle.chassisType;
  const classId = vehicle.classId;
  const heldCategories = draft.licence?.categories ?? [];

  /**
   * The spec defaults for a (class, body type) pair, or an empty patch when
   * the catalogue hasn't loaded or has no spec for the pair. Only ever called
   * for an unlocked class, so a missing spec here means the fetch is still in
   * flight — which in practice it isn't, since it starts on 3a and the driver
   * has to pick a body type and press Continue before reaching 3b.
   */
  function seedFromSpec(
    vehicleClass: VehicleClass,
    chassis: OnboardingDraftChassisType,
  ): SeededSpecValues {
    const code = resolveVehicleTypeSpecCode(vehicleClass.id, chassis);
    if (code === null) return {};

    const spec = vehicleTypeDefaults.find((entry) => entry.code === code);
    if (spec === undefined) return {};

    const seeded: SeededSpecValues = {};
    if (isSeedableValue(spec.maxPayloadKg)) {
      seeded.payloadKg = spec.maxPayloadKg;
    }
    if (isSeedableValue(spec.cargoLengthM)) {
      seeded.cargoLengthM = spec.cargoLengthM;
    }
    if (isSeedableValue(spec.cargoWidthM)) {
      seeded.cargoWidthM = spec.cargoWidthM;
    }
    if (isSeedableValue(spec.cargoHeightM)) {
      seeded.cargoHeightM = spec.cargoHeightM;
    }

    return seeded;
  }

  function handleSelectChassis(nextChassis: OnboardingDraftChassisType) {
    setBodyError(false);

    // Looked up rather than resolved through `findVehicleClass`, which throws
    // on an id it doesn't know: `classId` comes back from the server as part
    // of a stored draft, so a value retired by a later release must degrade to
    // "nothing selected", not crash the wizard.
    const previousClass = VEHICLE_CLASSES.find((entry) => entry.id === classId);
    const keepsClass =
      previousClass !== undefined &&
      resolveVehicleTypeSpecCode(previousClass.id, nextChassis) !== null;

    // Whole-object replace, because `updateDraft` merges at the section level.
    //
    // A surviving class is re-seeded from the *new* pair: the payload and cargo
    // dimensions sitting in the draft were seeded from the old body type's spec,
    // and the pair resolves to a different spec on the other side of this
    // change — `MEDIUM_TRUCK` alone spans 3,500 kg (box), 4,000 kg
    // (refrigerated) and 5,000 kg (flatbed). Left alone they would carry a
    // payload below the class minimum through 3c untouched and fail at submit,
    // blamed on a screen the driver never came back to. This is the only place
    // the re-seed can happen: `handleSelectClass` early-returns on a re-pick of
    // the class already selected, which is what 3b shows after this.
    const nextVehicle: DraftVehicle = {
      ...vehicle,
      chassisType: nextChassis,
      ...(keepsClass ? seedFromSpec(previousClass, nextChassis) : {}),
    };

    if (!keepsClass) {
      // The class would render locked on 3b under the new body type, so
      // carrying it forward would push an unselectable choice into 3c and the
      // review screen. The seeded payload/dimensions are left alone: 3b won't
      // let the driver continue without picking a class again, and that pick
      // overwrites them anyway.
      delete nextVehicle.classId;

      if (previousClass !== undefined) {
        // Dropping a visible selection silently is worse than one extra
        // toast — say which class went and why.
        showToast(
          `${previousClass.name} isn't offered as ${CHASSIS_LOCK_LABELS[nextChassis]} — choose another class.`,
        );
      }
    }

    updateDraft({ vehicle: nextVehicle });
  }

  function handleContinueFromBody() {
    if (chassisType === undefined) {
      setBodyError(true);
      showToast(VALIDATION_TOAST, "error");
      return;
    }

    setBodyError(false);
    setPhase("class");
  }

  // 3a's cards, and the fallback for the impossible state of reaching 3b with
  // no body type — which would leave every class's availability lock
  // uncomputable.
  if (phase === "body" || chassisType === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
          What kind of cargo body does the vehicle have?
        </p>

        <div
          className="flex flex-col gap-3"
          role="group"
          aria-label="Cargo body type"
        >
          {CHASSIS_OPTIONS.map((option) => {
            const selected = chassisType === option.id;

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => handleSelectChassis(option.id)}
                // The background is set in every branch rather than as a base
                // class: two background utilities on one element resolve by
                // stylesheet order, not by their order in this string.
                className={`flex w-full cursor-pointer items-center gap-4 rounded-[13px] border px-4 py-3.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  selected
                    ? "border-onboarding-accent bg-onboarding-accent/5"
                    : bodyError
                      ? "border-destructive bg-card"
                      : "border-border bg-card hover:border-muted-foreground/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-[18px] shrink-0 rounded-full border-[1.5px] ${
                    selected
                      ? "border-onboarding-accent bg-onboarding-accent shadow-[inset_0_0_0_2.5px_#fff]"
                      : "border-input bg-card"
                  }`}
                />
                <option.Silhouette />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    {option.name}
                  </span>
                  <span className="mt-[3px] block text-[12.5px] leading-[1.45] text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {bodyError ? (
          <p role="alert" className="text-xs text-destructive">
            {BODY_REQUIRED_MESSAGE}
          </p>
        ) : null}

        <div className="mt-2">
          <ContinueButton onClick={handleContinueFromBody} />
        </div>
      </div>
    );
  }

  // The body type past the guard above, as a value the handlers below can
  // close over: TypeScript does not carry a narrowing into a hoisted function
  // declaration, which could in principle be called from anywhere.
  const bodyType: OnboardingDraftChassisType = chassisType;

  // 3b. Locks are computed once per render, and the selected card is read back
  // out of the same list — so a class that has since become locked (the driver
  // went back and removed a licence category, say) can neither render as
  // selected nor pass validation.
  const classCards = VEHICLE_CLASSES.map((vehicleClass) => ({
    vehicleClass,
    lock: resolveClassLock(vehicleClass, heldCategories, bodyType),
  }));

  const selectedCard = classCards.find(
    (card) => card.vehicleClass.id === classId,
  );
  const hasValidClass =
    selectedCard !== undefined && selectedCard.lock === null;

  function handleSelectClass(
    vehicleClass: VehicleClass,
    lock: ClassLock | null,
  ) {
    // The single gate for both lock reasons, and the reason the card stays a
    // live button rather than a `disabled` one: a locked class must explain
    // itself when clicked (or activated from the keyboard), and must never
    // reach `updateDraft`.
    if (lock !== null) {
      showToast(lock.flash);
      return;
    }

    setClassError(false);

    // Re-picking the class already selected is a no-op rather than a re-seed:
    // the seeded payload and dimensions are editable in 3c, and a stray click
    // back here should not throw the driver's own numbers away.
    if (vehicleClass.id === classId) return;

    updateDraft({
      vehicle: {
        ...vehicle,
        classId: vehicleClass.id,
        ...seedFromSpec(vehicleClass, bodyType),
      },
    });
  }

  function handleContinueFromClass() {
    if (!hasValidClass) {
      setClassError(true);
      showToast(VALIDATION_TOAST, "error");
      return;
    }

    setClassError(false);
    goToStep(ONBOARDING_SCREENS.vehicleTechnical);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
        Pick the class that matches your vehicle. Classes above your licence
        categories, or not offered for the body type you chose, are locked.
      </p>

      <div
        className="flex flex-col gap-3"
        role="group"
        aria-label="Vehicle class"
      >
        {classCards.map(({ vehicleClass, lock }) => {
          const locked = lock !== null;
          const selected = !locked && vehicleClass.id === classId;

          return (
            <button
              key={vehicleClass.id}
              type="button"
              aria-pressed={selected}
              // Not the `disabled` attribute: the card must stay focusable and
              // clickable so it can explain its own lock.
              aria-disabled={locked}
              onClick={() => handleSelectClass(vehicleClass, lock)}
              // Locked cards keep the pointer cursor: they are still clickable,
              // they just answer with an explanation instead of a selection.
              // The background is per-branch for the same reason as 3a's cards.
              className={`flex w-full cursor-pointer flex-col gap-2 rounded-[13px] border p-[15px] text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                locked ? "opacity-65" : ""
              } ${
                selected
                  ? "border-onboarding-accent bg-onboarding-accent/5"
                  : classError && !locked
                    ? "border-destructive bg-card"
                    : "border-border bg-card hover:border-muted-foreground/40"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2.5">
                <span className="text-[15px] font-semibold">
                  {vehicleClass.name}
                </span>
                <span
                  className={`rounded-[5px] px-[7px] py-[3px] font-price text-[10.5px] font-semibold tracking-[0.06em] whitespace-nowrap ${
                    locked
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {vehicleClass.chip}
                </span>
              </span>

              <span className="text-[12.5px] text-muted-foreground">
                {vehicleClass.capacityLine}
              </span>

              <span className="w-full border-t border-border pt-2 text-[12px] leading-[1.5] text-muted-foreground">
                {vehicleClass.samplesLine}
              </span>

              {lock !== null ? (
                <span className="text-[12px] font-medium text-destructive">
                  {lock.note}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {classError ? (
        <p role="alert" className="text-xs text-destructive">
          {CLASS_REQUIRED_MESSAGE}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-3">
        <ContinueButton onClick={handleContinueFromClass} />
        {/* The shell's own Back arrow steps back a whole screen — to step 2 —
            because 3a and 3b share one screen number. Without this, the only
            way back to the body type would be out of step 3 and in again. */}
        <button
          type="button"
          onClick={() => setPhase("body")}
          className="h-12 cursor-pointer rounded-[11px] border border-border bg-card px-5 text-[15px] font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Body type
        </button>
      </div>
    </div>
  );
}

/** The design's primary CTA, shared by both sub-screens. */
function ContinueButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Deliberately never `disabled`: an empty selection is a validation
      // failure that owes the driver an explanation, not a dead button.
      className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      Continue
    </button>
  );
}

/*
 * ─── Body-type silhouettes ───────────────────────────────────────────────────
 *
 * Bespoke inline SVG line drawings, at the design's 172px, rather than raster
 * assets or `lucide-react` icons: these are three specific vehicle bodies that
 * no icon set contains, and they have to differ from each other in exactly the
 * details being chosen between (a roof cooling unit, a drop-side deck).
 *
 * Their greys and the two accent colours are hardcoded rather than themed. The
 * whole wizard is pinned to the light scheme (`[data-onboarding-surface]` in
 * `globals.css`), and these are illustrations with their own internal
 * light-source shading, not UI chrome that should follow the palette.
 *
 * Marked `aria-hidden`, unlike the prototype's labelled `role="img"`: each one
 * sits inside a button whose text already names and describes the body type,
 * so a label here would only prepend "Side view of a dry box truck" to that
 * button's accessible name.
 */

/** Shared cab, identical across all three drawings. */
const CAB_BODY_PATH =
  "M240 118 V62 Q240 53 249 51 L287 43 Q295 43 300 49 L321 76 Q331 82 331 97 V118 Z";
const CAB_SIDE_WINDOW_PATH = "M251 63 L285 56 V78 H251 Z";
const CAB_WINDSCREEN_PATH = "M293 57 L316 80 H293 Z";
/** The wing mirror, drawn as a stub off the front of the cab. */
const CAB_MIRROR_PATH = "M331 68 h9";

const SILHOUETTE_CLASS_NAME = "h-auto w-[172px] shrink-0";

function DryBoxSilhouette() {
  return (
    <svg
      viewBox="0 0 360 150"
      aria-hidden="true"
      className={SILHOUETTE_CLASS_NAME}
    >
      <g
        stroke="oklch(0.7 0 0)"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={CAB_BODY_PATH} fill="#fbfbfb" />
        <path d={CAB_SIDE_WINDOW_PATH} fill="#dfe4e8" />
        <path d={CAB_WINDSCREEN_PATH} fill="#dfe4e8" />
        {/* The enclosed box body, with the rear door panel picked out. */}
        <path d="M30 30 H240 V118 H30 Z" fill="#f7f7f8" />
        <path d="M37 38 H63 V110 H37 Z" fill="#f1f1f2" />
      </g>
      <g stroke="oklch(0.88 0 0)" strokeWidth="1.2">
        <path d="M30 37 H240 M120 30 V118 M180 30 V118" />
      </g>
      <path d="M26 118 H332 V128 H26 Z" fill="oklch(0.42 0 0)" />
      <g fill="oklch(0.26 0 0)">
        <circle cx="96" cy="128" r="18" />
        <circle cx="272" cy="128" r="19" />
      </g>
      <g fill="oklch(0.84 0 0)">
        <circle cx="96" cy="128" r="7.5" />
        <circle cx="272" cy="128" r="8" />
      </g>
      <g fill="#e0691c">
        <rect x="27" y="104" width="6" height="9" rx="1" />
        <rect x="325" y="102" width="7" height="8" rx="1" />
      </g>
      <path d={CAB_MIRROR_PATH} stroke="oklch(0.5 0 0)" strokeWidth="1.7" />
    </svg>
  );
}

function RefrigeratedSilhouette() {
  return (
    <svg
      viewBox="0 0 360 150"
      aria-hidden="true"
      className={SILHOUETTE_CLASS_NAME}
    >
      <g
        stroke="oklch(0.7 0 0)"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={CAB_BODY_PATH} fill="#fbfbfb" />
        <path d={CAB_SIDE_WINDOW_PATH} fill="#dfe4e8" />
        <path d={CAB_WINDSCREEN_PATH} fill="#dfe4e8" />
        <path d="M30 30 H240 V118 H30 Z" fill="#f7f7f8" />
        {/* The roof-mounted cooling unit, the one shape that distinguishes
            this body from the dry box. */}
        <path
          d="M198 8 H242 Q248 8 248 14 V30 H192 V14 Q192 8 198 8 Z"
          fill="#eceef0"
        />
        <path d="M37 38 H63 V110 H37 Z" fill="#f1f1f2" />
      </g>
      {/* Cooling-unit vents. */}
      <g stroke="oklch(0.76 0 0)" strokeWidth="1.3">
        <path d="M200 15 H240 M200 21 H240 M200 27 H240" />
      </g>
      <g stroke="oklch(0.88 0 0)" strokeWidth="1.2">
        <path d="M30 37 H240 M120 30 V118 M180 30 V118" />
      </g>
      <path d="M26 118 H332 V128 H26 Z" fill="oklch(0.42 0 0)" />
      <g fill="oklch(0.26 0 0)">
        <circle cx="96" cy="128" r="18" />
        <circle cx="272" cy="128" r="19" />
      </g>
      <g fill="oklch(0.84 0 0)">
        <circle cx="96" cy="128" r="7.5" />
        <circle cx="272" cy="128" r="8" />
      </g>
      {/* Snowflake glyph on the box side. */}
      <g stroke="#2f5fb8" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M88 56 v26 M76 62 l24 14 M76 76 l24 -14" />
      </g>
      <g fill="#e0691c">
        <rect x="27" y="104" width="6" height="9" rx="1" />
        <rect x="325" y="102" width="7" height="8" rx="1" />
      </g>
      <path d={CAB_MIRROR_PATH} stroke="oklch(0.5 0 0)" strokeWidth="1.7" />
    </svg>
  );
}

function OpenChassisSilhouette() {
  return (
    <svg
      viewBox="0 0 360 150"
      aria-hidden="true"
      className={SILHOUETTE_CLASS_NAME}
    >
      <g
        stroke="oklch(0.7 0 0)"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={CAB_BODY_PATH} fill="#fbfbfb" />
        <path d={CAB_SIDE_WINDOW_PATH} fill="#dfe4e8" />
        <path d={CAB_WINDSCREEN_PATH} fill="#dfe4e8" />
        {/* A low deck instead of a box body — the drop sides, drawn as the
            hinged panels below. */}
        <path d="M30 74 H240 V106 H30 Z" fill="#f7f7f8" />
      </g>
      <g stroke="oklch(0.86 0 0)" strokeWidth="1.2">
        <path d="M30 84 H240 M30 95 H240 M86 74 V106 M142 74 V106 M198 74 V106" />
      </g>
      <path d="M26 106 H332 V118 H26 Z" fill="oklch(0.42 0 0)" />
      <rect
        x="152"
        y="112"
        width="76"
        height="16"
        rx="3"
        fill="oklch(0.3 0 0)"
      />
      <g fill="oklch(0.26 0 0)">
        <circle cx="96" cy="126" r="18" />
        <circle cx="272" cy="126" r="19" />
      </g>
      <g fill="oklch(0.84 0 0)">
        <circle cx="96" cy="126" r="7.5" />
        <circle cx="272" cy="126" r="8" />
      </g>
      <g fill="#e0691c">
        <rect x="27" y="108" width="6" height="8" rx="1" />
        <rect x="112" y="108" width="9" height="7" rx="1" />
        <rect x="325" y="100" width="7" height="8" rx="1" />
      </g>
      <path d={CAB_MIRROR_PATH} stroke="oklch(0.5 0 0)" strokeWidth="1.7" />
    </svg>
  );
}
