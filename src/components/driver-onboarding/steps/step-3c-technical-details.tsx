"use client";

/**
 * Step 3c — technical details: make/model, year of manufacture, licence plate,
 * colour, declared maximum payload, and the cargo hold's length/width/height.
 * The shell routes to it on `ONBOARDING_SCREENS.vehicleTechnical`.
 *
 * Everything collected here is a *declared* value — the driver's own attestation
 * about their vehicle, reviewed by a human alongside the uploaded documents. It
 * is deliberately never read by pricing or order matching, which key on the
 * class-level `VehicleTypeSpec` only (see `requirements.md`'s Technical
 * Constraints). That is why the usable-volume line below the dimension inputs
 * says the volume is shown to the review team rather than repeating the design
 * prototype's "used to match you with orders" — the latter would promise the
 * driver behaviour this backend does not implement.
 *
 * The payload and dimension fields arrive pre-filled from the `VehicleTypeSpec`
 * defaults the previous screen seeded into the draft, and stay freely editable:
 * a seeded value is a starting point, not a read-only fact about this vehicle.
 */

import { useMemo, useRef, useState } from "react";

import {
  ONBOARDING_SCREENS,
  useOnboardingDraft,
} from "@/components/driver-onboarding/onboarding-draft-context";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { OnboardingDraftV1 } from "@/lib/driver-onboarding/draft-schema";
import {
  findVehicleClass,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";

/** The `vehicle` section of the draft, as this step reads and rewrites it. */
type DraftVehicle = NonNullable<OnboardingDraftV1["vehicle"]>;

/**
 * Six real models per class, from the design. Only a starting point for the
 * searchable dropdown: free text is accepted (and the submit endpoint does not
 * re-check make/model against this table either), because no fixed list can
 * cover every vehicle a Georgian owner-driver might turn up with.
 */
const MODELS_BY_CLASS: Record<VehicleClassId, [make: string, model: string][]> =
  {
    SMALL_VAN: [
      ["Renault", "Dokker"],
      ["Fiat", "Doblò Cargo"],
      ["Toyota", "Proace City"],
      ["Ford", "Transit Connect"],
      ["Citroën", "Berlingo Van"],
      ["Peugeot", "Partner"],
    ],
    LARGE_VAN: [
      ["Fiat", "Ducato"],
      ["Ford", "Transit"],
      ["Mercedes-Benz", "Sprinter"],
      ["Renault", "Master"],
      ["Volkswagen", "Crafter"],
      ["Iveco", "Daily"],
    ],
    MEDIUM_TRUCK: [
      ["Hino", "916"],
      ["Mitsubishi Fuso", "Canter 7C15"],
      ["Isuzu", "NPR 75"],
      ["Iveco", "Eurocargo 120E"],
      ["Mercedes-Benz", "Atego 1018"],
      ["Ford Trucks", "1026"],
    ],
    HEAVY_FREIGHT_TRUCK: [
      ["MAN", "TGM 18.290"],
      ["MAN", "TGL 12.220"],
      ["Volvo", "FL 280"],
      ["Scania", "P 280"],
      ["DAF", "LF 260"],
      ["Mercedes-Benz", "Actros 1845"],
    ],
  };

/** The twelve colour swatches, from the design. Stored by name, not by hex. */
const COLORS: [name: string, hex: string][] = [
  ["White", "#ffffff"],
  ["Silver", "#c9ccd1"],
  ["Grey", "#8a8f96"],
  ["Black", "#1a1a1c"],
  ["Blue", "#2f5fb8"],
  ["Navy", "#1e2a4a"],
  ["Red", "#c0392b"],
  ["Green", "#2f7a4a"],
  ["Yellow", "#e8c33a"],
  ["Orange", "#e0691c"],
  ["Beige", "#ded3bd"],
  ["Brown", "#6b4a2f"],
];

/**
 * Oldest year of manufacture accepted, from the design. Deliberately *not* the
 * `MIN_VEHICLE_YEAR = 1980` floor used by `src/app/api/driver-profile/vehicles/
 * validation.ts` — that is the unrelated "add a vehicle" form for the existing
 * booking flow, and onboarding applies the stricter rule the design specifies.
 */
const MIN_YEAR = 1995;
const MIN_PLATE_LENGTH = 4;
const MIN_PAYLOAD_KG = 100;
const MAX_PAYLOAD_KG = 40_000;
const MAX_DIMENSION_M = 20;

/** Every message the step can show, kept together so the copy is reviewable. */
const MESSAGES = {
  makeModel: "Select or type the make and model.",
  yearMissing: "Enter the year of manufacture.",
  plateMissing: "Enter the licence plate.",
  plateShort: "That plate looks incomplete.",
  colour: "Select the vehicle colour.",
  payloadMissing: "Enter the maximum payload in kg.",
  payloadLow: `Payload must be at least ${MIN_PAYLOAD_KG} kg.`,
  payloadHigh: "Payload above 40,000 kg needs a fleet account.",
  dimensionsMissing: "Give length, width and height in metres.",
  dimensionsHigh: "Check the dimensions — metres, not centimetres.",
  noModelMatch: "No match. Type the make and model manually.",
  volumeHint: "Length × width × height of the usable load space.",
  fixFields: "Fix the highlighted fields to continue.",
} as const;

/** Shared input styling: the design's 46px field, on the shadcn primitive. */
const FIELD_CLASS =
  "h-[46px] rounded-[10px] border-border bg-card px-3.5 text-[15px] md:text-[15px] focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15";

const LABEL_CLASS =
  "text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase";

const ERROR_CLASS = "text-xs text-destructive";

/** Which fields can currently be showing an error. */
type FieldKey =
  | "makeModel"
  | "year"
  | "plate"
  | "colour"
  | "payload"
  | "dimensions";

type FieldErrors = Partial<Record<FieldKey, string>>;

/**
 * The step's local mirror of the draft. Held as strings rather than numbers so a
 * half-typed "6." survives a keystroke, and so an emptied field reads as empty
 * rather than snapping back to zero.
 */
type FormValues = {
  /** What the driver sees in the make/model box. */
  makeModelQuery: string;
  /**
   * Set verbatim when a row is picked from the list, and otherwise derived from
   * the query — splitting on the first space, which is the only split a free-text
   * box can make. Picking "Mitsubishi Fuso / Canter 7C15" therefore keeps its
   * two-word make, which re-splitting the query would have got wrong.
   */
  make: string;
  model: string;
  year: string;
  plate: string;
  colour: string;
  payload: string;
  length: string;
  width: string;
  height: string;
};

/** A stored number as a field value; an absent number is an empty field. */
function numberToField(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** A field value as a stored number, or `undefined` for blank/unparseable. */
function fieldToNumber(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A field value as a stored string, or `undefined` for blank. */
function fieldToText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Free text split into a make and a model, on the first run of whitespace. */
function splitMakeModel(query: string): { make: string; model: string } {
  const trimmed = query.trim();
  if (trimmed === "") return { make: "", model: "" };

  const boundary = trimmed.search(/\s/);
  if (boundary === -1) return { make: trimmed, model: "" };

  return {
    make: trimmed.slice(0, boundary),
    model: trimmed.slice(boundary + 1).trim(),
  };
}

/** Keeps only digits — the year and payload fields are whole numbers. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Keeps digits and a single decimal point, for a metre measurement. */
function decimalOnly(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;

  // Everything after the first point keeps its digits but loses further points,
  // so "2.4.0" becomes "2.40" rather than being rejected outright.
  return (
    cleaned.slice(0, firstDot + 1) +
    cleaned.slice(firstDot + 1).replace(/\./g, "")
  );
}

/** The form state a resumed (or freshly seeded) draft starts from. */
function initialValues(vehicle: DraftVehicle | undefined): FormValues {
  const make = vehicle?.make ?? "";
  const model = vehicle?.model ?? "";

  return {
    makeModelQuery: [make, model].filter((part) => part !== "").join(" "),
    make,
    model,
    year: numberToField(vehicle?.year),
    plate: vehicle?.plateNumber ?? "",
    colour: vehicle?.colour ?? "",
    payload: numberToField(vehicle?.payloadKg),
    length: numberToField(vehicle?.cargoLengthM),
    width: numberToField(vehicle?.cargoWidthM),
    height: numberToField(vehicle?.cargoHeightM),
  };
}

/**
 * Every failing field at once, so Continue can highlight all of them rather than
 * marching the driver through one error at a time. `currentYear` is passed in
 * rather than read here so the ceiling is computed once per render pass and the
 * rule stays a pure function of its inputs.
 */
function validate(values: FormValues, currentYear: number): FieldErrors {
  const errors: FieldErrors = {};

  if (values.makeModelQuery.trim() === "") {
    errors.makeModel = MESSAGES.makeModel;
  }

  const year = Number.parseInt(values.year, 10);
  if (values.year.trim() === "") {
    errors.year = MESSAGES.yearMissing;
  } else if (
    !Number.isFinite(year) ||
    year < MIN_YEAR ||
    year > currentYear
  ) {
    errors.year = `Year must be between ${MIN_YEAR} and ${currentYear}.`;
  }

  const plate = values.plate.trim();
  if (plate === "") {
    errors.plate = MESSAGES.plateMissing;
  } else if (plate.length < MIN_PLATE_LENGTH) {
    errors.plate = MESSAGES.plateShort;
  }

  if (values.colour === "") {
    errors.colour = MESSAGES.colour;
  }

  const payload = Number.parseInt(values.payload, 10);
  if (values.payload.trim() === "") {
    errors.payload = MESSAGES.payloadMissing;
  } else if (!Number.isFinite(payload) || payload < MIN_PAYLOAD_KG) {
    errors.payload = MESSAGES.payloadLow;
  } else if (payload > MAX_PAYLOAD_KG) {
    errors.payload = MESSAGES.payloadHigh;
  }

  const dimensions = [values.length, values.width, values.height].map((value) =>
    Number.parseFloat(value),
  );
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    errors.dimensions = MESSAGES.dimensionsMissing;
  } else if (dimensions.some((value) => value > MAX_DIMENSION_M)) {
    errors.dimensions = MESSAGES.dimensionsHigh;
  }

  return errors;
}

export function Step3cTechnicalDetails() {
  const { draft, updateDraft, goToStep, showToast } = useOnboardingDraft();

  const [values, setValues] = useState<FormValues>(() =>
    initialValues(draft.vehicle),
  );
  // The newest values, readable from an event handler that fires before React
  // has re-rendered with the previous edit — two keystrokes in one tick would
  // otherwise write the draft from a stale snapshot.
  const valuesRef = useRef<FormValues>(values);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [modelsOpen, setModelsOpen] = useState(false);
  // Which option the arrow keys are on, or -1 for "none"; reset whenever the
  // filtered list changes so the highlight can never point past its end.
  const [activeOption, setActiveOption] = useState(-1);
  const makeModelInputRef = useRef<HTMLInputElement>(null);

  const classId = draft.vehicle?.classId;
  const className = classId ? findVehicleClass(classId).name : "vehicle";
  const isFlatbed = draft.vehicle?.chassisType === "OPEN_CHASSIS";
  // Recomputed per render rather than captured once: a wizard left open across
  // midnight on 31 December must not reject a brand-new vehicle's year.
  const currentYear = new Date().getFullYear();

  const modelOptions = useMemo(() => {
    const all = classId ? MODELS_BY_CLASS[classId] : [];
    const query = values.makeModelQuery.toLowerCase().trim();
    if (query === "") return all;

    return all.filter(([make, model]) =>
      `${make} ${model}`.toLowerCase().includes(query),
    );
  }, [classId, values.makeModelQuery]);

  /**
   * Applies a patch to the form state and mirrors the whole vehicle section into
   * the draft. The section is rewritten wholesale because `updateDraft` merges
   * at the section level — spreading the current `draft.vehicle` first is what
   * preserves the chassis type and class the previous screen chose.
   */
  function updateValues(patch: Partial<FormValues>) {
    const next = { ...valuesRef.current, ...patch };
    valuesRef.current = next;
    setValues(next);

    updateDraft({
      vehicle: {
        ...draft.vehicle,
        make: fieldToText(next.make),
        model: fieldToText(next.model),
        year: fieldToNumber(next.year),
        plateNumber: fieldToText(next.plate),
        colour: fieldToText(next.colour),
        payloadKg: fieldToNumber(next.payload),
        cargoLengthM: fieldToNumber(next.length),
        cargoWidthM: fieldToNumber(next.width),
        cargoHeightM: fieldToNumber(next.height),
      },
    });
  }

  function handleQueryChange(query: string) {
    updateValues({ makeModelQuery: query, ...splitMakeModel(query) });
    setModelsOpen(true);
    setActiveOption(-1);
  }

  function handlePickModel(make: string, model: string) {
    updateValues({ makeModelQuery: `${make} ${model}`, make, model });
    setModelsOpen(false);
    setActiveOption(-1);
    makeModelInputRef.current?.focus();
  }

  function handleQueryKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setModelsOpen(false);
      setActiveOption(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!modelsOpen) {
        setModelsOpen(true);
        setActiveOption(0);
        return;
      }
      if (modelOptions.length === 0) return;

      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveOption((current) => {
        const next = current + step;
        // Clamped rather than wrapped: the list is short, and wrapping past the
        // last row reads as the highlight vanishing.
        if (next < 0) return 0;
        if (next > modelOptions.length - 1) return modelOptions.length - 1;
        return next;
      });
      return;
    }

    if (event.key === "Enter" && modelsOpen) {
      const option = modelOptions[activeOption];
      if (option) {
        // Only swallow the key when it actually picks something, so Enter on a
        // free-text entry still falls through to the form's submit.
        event.preventDefault();
        handlePickModel(option[0], option[1]);
      }
    }
  }

  function handleContinue() {
    const found = validate(valuesRef.current, currentYear);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      setModelsOpen(false);
      showToast(MESSAGES.fixFields, "error");
      return;
    }

    goToStep(ONBOARDING_SCREENS.review);
  }

  const volume = useMemo(() => {
    const length = Number.parseFloat(values.length);
    const width = Number.parseFloat(values.width);
    const height = Number.parseFloat(values.height);
    // Shown the moment all three parse, not only once they pass validation:
    // seeing the volume move is how a driver notices a centimetre-scale typo.
    if (
      !Number.isFinite(length) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return null;
    }

    return (length * width * height).toFixed(1);
  }, [values.length, values.width, values.height]);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        handleContinue();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="vehicle-make-model" className={LABEL_CLASS}>
          Make and model
        </label>
        <Popover open={modelsOpen} onOpenChange={setModelsOpen}>
          <PopoverAnchor asChild>
            <Input
              id="vehicle-make-model"
              ref={makeModelInputRef}
              role="combobox"
              aria-expanded={modelsOpen}
              aria-controls="vehicle-make-model-list"
              aria-autocomplete="list"
              aria-activedescendant={
                modelsOpen && activeOption >= 0
                  ? `vehicle-make-model-option-${activeOption}`
                  : undefined
              }
              aria-invalid={errors.makeModel !== undefined}
              aria-describedby={
                errors.makeModel !== undefined
                  ? "vehicle-make-model-error"
                  : undefined
              }
              autoComplete="off"
              placeholder={`Search ${className} models`}
              value={values.makeModelQuery}
              onChange={(event) => handleQueryChange(event.target.value)}
              onFocus={() => setModelsOpen(true)}
              onKeyDown={handleQueryKeyDown}
              className={FIELD_CLASS}
            />
          </PopoverAnchor>
          <PopoverContent
            // The content portals to `document.body`, outside the wizard's
            // `[data-onboarding-surface]` subtree, so it carries the marker
            // itself — the same thing the toast and the upload dialog do.
            data-onboarding-surface=""
            id="vehicle-make-model-list"
            role="listbox"
            align="start"
            sideOffset={6}
            // Focus stays in the text box: this is a filter field with a list
            // under it, not a menu the driver has been moved into.
            onOpenAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              // Clicking the input itself is not "outside" — without this the
              // list closes on mousedown and reopens on focus, flickering.
              if (
                makeModelInputRef.current?.contains(event.target as Node | null)
              ) {
                event.preventDefault();
              }
            }}
            className="max-h-[236px] w-(--radix-popover-trigger-width) gap-0 overflow-y-auto rounded-[10px] border border-border bg-card p-0"
          >
            {modelOptions.map(([make, model], index) => (
              <button
                key={`${make} ${model}`}
                type="button"
                id={`vehicle-make-model-option-${index}`}
                role="option"
                aria-selected={index === activeOption}
                onClick={() => handlePickModel(make, model)}
                onMouseEnter={() => setActiveOption(index)}
                className={`flex w-full cursor-pointer items-baseline gap-2 border-b border-border px-3.5 py-2.5 text-left last:border-b-0 ${
                  index === activeOption ? "bg-muted" : "bg-card"
                }`}
              >
                <span className="text-sm font-semibold">{make}</span>
                <span className="text-[13px] text-muted-foreground">
                  {model}
                </span>
              </button>
            ))}
            {modelOptions.length === 0 ? (
              <p className="px-3.5 py-2.5 text-[13px] text-muted-foreground">
                {MESSAGES.noModelMatch}
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
        {errors.makeModel !== undefined ? (
          <p id="vehicle-make-model-error" className={ERROR_CLASS}>
            {errors.makeModel}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="vehicle-year" className={LABEL_CLASS}>
            Year
          </label>
          <Input
            id="vehicle-year"
            // Text rather than `type="number"`: the design renders these in the
            // mono face with no spinner, and a number input would also change
            // value on a stray scroll over the field. The keypad hint and the
            // digits-only filter give numeric entry without either drawback.
            inputMode="numeric"
            maxLength={4}
            aria-invalid={errors.year !== undefined}
            aria-describedby={
              errors.year !== undefined ? "vehicle-year-error" : undefined
            }
            placeholder="2021"
            value={values.year}
            onChange={(event) =>
              updateValues({ year: digitsOnly(event.target.value) })
            }
            className={`${FIELD_CLASS} font-price`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="vehicle-plate" className={LABEL_CLASS}>
            Licence plate
          </label>
          <Input
            id="vehicle-plate"
            aria-invalid={errors.plate !== undefined}
            aria-describedby={
              errors.plate !== undefined ? "vehicle-plate-error" : undefined
            }
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="34 ABC 128"
            value={values.plate}
            // Uppercased in state, not merely via `text-transform`, so the value
            // that reaches the draft (and the reviewer) is the one on screen.
            onChange={(event) =>
              updateValues({ plate: event.target.value.toUpperCase() })
            }
            className={`${FIELD_CLASS} font-price text-[16px] font-semibold tracking-[0.12em] md:text-[16px]`}
          />
        </div>
      </div>
      {errors.year !== undefined ? (
        <p id="vehicle-year-error" className={`${ERROR_CLASS} -mt-2`}>
          {errors.year}
        </p>
      ) : null}
      {errors.plate !== undefined ? (
        <p id="vehicle-plate-error" className={`${ERROR_CLASS} -mt-2`}>
          {errors.plate}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className={LABEL_CLASS}>Colour</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COLORS.map(([name, hex]) => {
            const selected = values.colour === name;

            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                onClick={() => updateValues({ colour: name })}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-2.5 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  selected
                    ? "border-onboarding-accent bg-onboarding-accent/6"
                    : errors.colour !== undefined
                      ? "border-destructive bg-card hover:bg-muted"
                      : "border-border bg-card hover:bg-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  style={{ background: hex }}
                  className="size-4 shrink-0 rounded-full border border-foreground/15"
                />
                <span
                  className={`text-[13px] ${
                    selected ? "font-semibold" : "font-medium"
                  }`}
                >
                  {name}
                </span>
              </button>
            );
          })}
        </div>
        {errors.colour !== undefined ? (
          <p className={ERROR_CLASS}>{errors.colour}</p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="vehicle-payload" className={LABEL_CLASS}>
          Maximum payload (kg)
        </label>
        <Input
          id="vehicle-payload"
          inputMode="numeric"
          aria-invalid={errors.payload !== undefined}
          aria-describedby={
            errors.payload !== undefined ? "vehicle-payload-error" : undefined
          }
          placeholder="1400"
          value={values.payload}
          onChange={(event) =>
            updateValues({ payload: digitsOnly(event.target.value) })
          }
          className={`${FIELD_CLASS} font-price`}
        />
        {errors.payload !== undefined ? (
          <p id="vehicle-payload-error" className={ERROR_CLASS}>
            {errors.payload}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5">
        <span className={LABEL_CLASS}>Cargo hold (metres)</span>

        <CargoDiagram flatbed={isFlatbed} />

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <DimensionField
            id="vehicle-cargo-length"
            badge="1"
            label="Length"
            placeholder="6.20"
            value={values.length}
            invalid={errors.dimensions !== undefined}
            onChange={(next) => updateValues({ length: next })}
          />
          <DimensionField
            id="vehicle-cargo-width"
            badge="2"
            label="Width"
            placeholder="2.40"
            value={values.width}
            invalid={errors.dimensions !== undefined}
            onChange={(next) => updateValues({ width: next })}
          />
          <DimensionField
            id="vehicle-cargo-height"
            badge="3"
            label="Height"
            placeholder="2.40"
            value={values.height}
            invalid={errors.dimensions !== undefined}
            onChange={(next) => updateValues({ height: next })}
          />
        </div>

        {errors.dimensions !== undefined ? (
          <p id="vehicle-cargo-error" className={ERROR_CLASS}>
            {errors.dimensions}
          </p>
        ) : null}

        {/* Deliberately *not* the design prototype's "used to match you with
            orders": these declared dimensions are compliance-facing overrides
            that order matching never reads (see this file's header comment). */}
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {volume === null
            ? MESSAGES.volumeHint
            : `Usable volume ${volume} m³ — shown to the review team alongside your declared payload.`}
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3.5 border-t border-border pt-5">
        <button
          type="submit"
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => goToStep(ONBOARDING_SCREENS.vehicleBodyAndClass)}
          className="h-12 cursor-pointer rounded-[11px] border border-border bg-card px-5 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Back
        </button>
      </div>
    </form>
  );
}

/** One of the three metre inputs, with its numbered badge. */
function DimensionField({
  id,
  badge,
  label,
  placeholder,
  value,
  invalid,
  onChange,
}: {
  id: string;
  badge: string;
  label: string;
  placeholder: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className="flex size-4 items-center justify-center rounded-full bg-onboarding-accent font-price text-[10px] font-bold text-white"
        >
          {badge}
        </span>
        {label}
      </label>
      <Input
        id={id}
        inputMode="decimal"
        aria-invalid={invalid}
        aria-describedby={invalid ? "vehicle-cargo-error" : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(decimalOnly(event.target.value))}
        className={`${FIELD_CLASS} font-price px-3`}
      />
    </div>
  );
}

/**
 * The measurement guide above the dimension inputs: a side view carrying badges
 * 1 (length) and 3 (height), a rear view carrying badge 2 (width), and a legend.
 *
 * Both silhouette and legend switch on the body type chosen on the previous
 * screen, because the two vehicles are measured differently — an enclosed body
 * is measured wall to wall *inside* the box, a flatbed along its deck and up to
 * the top of its drop sides. Hand-authored inline SVG, matching how the chassis
 * cards on the previous screen draw their own bespoke silhouettes.
 *
 * The greys are literal rather than tokens on purpose: this is a technical
 * illustration on a surface pinned to the light palette (see `globals.css`), and
 * its shading has to stay readable independently of the theme tokens around it.
 */
function CargoDiagram({ flatbed }: { flatbed: boolean }) {
  // Where the rear view's body starts: a flatbed's side panels are short, so its
  // rear outline is the same box drawn from lower down.
  const rearTop = flatbed ? 96 : 60;

  const note = flatbed
    ? "Measure the usable deck, and the height of the drop sides."
    : "Measure the load space inside the body, not the outside of the vehicle.";

  const legend: [badge: string, label: string, note: string][] = flatbed
    ? [
        ["1", "Length", "deck front to tail"],
        ["2", "Width", "deck side to side"],
        ["3", "Height", "deck to top of side panel"],
      ]
    : [
        ["1", "Length", "front wall to doors"],
        ["2", "Width", "wall to wall"],
        ["3", "Height", "floor to ceiling"],
      ];

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[13px] border border-border bg-card px-4.5 py-4">
      <svg
        viewBox="0 0 420 200"
        className="h-auto w-[300px] shrink-0"
        role="img"
        aria-label={
          flatbed
            ? "Side view of a flatbed truck showing 1 deck length and 3 side panel height"
            : "Side view of a box truck showing 1 body length and 3 body height"
        }
      >
        {/* Cab — identical for both bodies. */}
        <g
          stroke="oklch(0.72 0 0)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path
            d="M286 140 V82 Q286 75 293 73 L331 66 Q338 66 343 72 L366 98 Q374 103 374 113 V140 Z"
            fill="#fbfbfb"
          />
          <path d="M296 82 L330 76 L330 98 L296 98 Z" fill="#eceef0" />
          <path d="M338 78 L360 100 L338 100 Z" fill="#eceef0" />
          {flatbed ? (
            <path d="M52 96 H286 V132 H52 Z" fill="#f7f7f8" />
          ) : (
            <>
              <path d="M52 60 H286 V140 H52 Z" fill="#f7f7f8" />
              <path d="M52 60 H286" />
            </>
          )}
        </g>

        {/* Panel lines: fewer and shallower on a flatbed's drop sides. */}
        <g stroke="oklch(0.87 0 0)" strokeWidth="1.2">
          {flatbed ? (
            <path d="M52 108 H286 M52 120 H286 M148 96 V132 M244 96 V132" />
          ) : (
            <path d="M52 84 H286 M52 108 H286 M100 60 V140 M148 60 V140 M196 60 V140 M244 60 V140" />
          )}
        </g>

        <path
          d={flatbed ? "M44 132 H366 V150 H44 Z" : "M44 140 H366 V150 H44 Z"}
          fill="oklch(0.42 0 0)"
        />
        <g fill="oklch(0.26 0 0)">
          <circle cx="120" cy="150" r="21" />
          <circle cx="312" cy="150" r="23" />
        </g>
        <g fill="oklch(0.82 0 0)">
          <circle cx="120" cy="150" r="9" />
          <circle cx="312" cy="150" r="10" />
        </g>

        {/* Dimension arrows: length along the body, height up its side. */}
        <g stroke="oklch(0.32 0 0)" strokeWidth="1.6" fill="none">
          <path d="M52 180 H286" />
          <path d="M52 180 l7 -4 M52 180 l7 4 M286 180 l-7 -4 M286 180 l-7 4" />
          {flatbed ? (
            <>
              <path d="M30 96 V132" />
              <path d="M30 96 l-4 7 M30 96 l4 7 M30 132 l-4 -7 M30 132 l4 -7" />
            </>
          ) : (
            <>
              <path d="M30 60 V140" />
              <path d="M30 60 l-4 7 M30 60 l4 7 M30 140 l-4 -7 M30 140 l4 -7" />
            </>
          )}
        </g>

        <g className="font-price" fontSize="12" fontWeight="600">
          <circle cx="169" cy="180" r="12" className="fill-onboarding-accent" />
          <text x="169" y="184.5" textAnchor="middle" fill="#fff">
            1
          </text>
          <circle
            cx="30"
            cy={flatbed ? 114 : 100}
            r="12"
            className="fill-onboarding-accent"
          />
          <text
            x="30"
            y={flatbed ? 118.5 : 104.5}
            textAnchor="middle"
            fill="#fff"
          >
            3
          </text>
        </g>
      </svg>

      <svg
        viewBox="0 0 130 200"
        className="h-auto w-[82px] shrink-0"
        role="img"
        aria-label="Rear view showing 2 body width"
      >
        <g stroke="oklch(0.72 0 0)" strokeWidth="1.6" strokeLinejoin="round">
          <path d={`M24 ${rearTop} H106 V132 H24 Z`} fill="#f7f7f8" />
        </g>
        <g stroke="oklch(0.87 0 0)" strokeWidth="1.2">
          <path d={`M65 ${rearTop} V132`} />
        </g>
        <path d="M18 132 H112 V144 H18 Z" fill="oklch(0.42 0 0)" />
        <g fill="oklch(0.26 0 0)">
          <circle cx="34" cy="150" r="14" />
          <circle cx="96" cy="150" r="14" />
        </g>
        <g stroke="oklch(0.32 0 0)" strokeWidth="1.6" fill="none">
          <path d="M24 180 H106" />
          <path d="M24 180 l7 -4 M24 180 l7 4 M106 180 l-7 -4 M106 180 l-7 4" />
        </g>
        <g className="font-price" fontSize="12" fontWeight="600">
          <circle cx="65" cy="180" r="12" className="fill-onboarding-accent" />
          <text x="65" y="184.5" textAnchor="middle" fill="#fff">
            2
          </text>
        </g>
      </svg>

      <div className="flex min-w-[160px] flex-1 flex-col gap-2.5">
        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
          {note}
        </p>
        {legend.map(([badge, label, hint]) => (
          <div key={badge} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-[19px] shrink-0 items-center justify-center rounded-full bg-onboarding-accent font-price text-[11px] font-bold text-white"
            >
              {badge}
            </span>
            <span className="text-[13px] font-semibold">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
