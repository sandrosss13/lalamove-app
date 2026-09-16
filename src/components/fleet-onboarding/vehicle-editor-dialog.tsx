"use client";

/**
 * The 640px dialog that specifies one vehicle: make and model from a searchable
 * list of published reference rows, year, licence plate, colour, maximum payload
 * and the cargo hold's three dimensions.
 *
 * Its own module, and deliberately **props-driven and context-free** — no
 * `useFleetDraft()`, no `fetch`, no router. Two callers mount it and they save in
 * completely different ways: step 3 hands it an `onSave` that writes the wizard
 * draft synchronously, while the application status screen (`task-15`) mounts it
 * outside the wizard entirely and hands it an `onSave` that `PATCH`es the
 * per-vehicle correction endpoint, passing `saving` and `saveError` along with
 * it. A component declared inside the step file would be unreachable from there,
 * which is why `VehicleEditorDialog` and `VehicleEditorValues` are named exports
 * of this file.
 *
 * Picking a model prefills payload and dimensions from `task-03`'s reference
 * table, adjusted for the cargo body type, and the footer names that source so
 * the company knows which numbers it is being asked to correct. A prefill is a
 * starting point, never a fact: every prefilled field stays freely editable.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChassisType } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  findBodyType,
  findVehicleClass,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
import type { FleetDraftVehicle } from "@/lib/fleet-onboarding/draft-schema";
import {
  VEHICLE_MESSAGES,
  firstVehicleMessage,
  validateFleetVehicle,
  type VehicleFieldErrors,
  type VehicleFieldKey,
} from "@/lib/fleet-onboarding/fleet-vehicles";
import {
  defaultSpecForClass,
  formatDimensionM,
  formatPayloadKg,
  searchModelReferences,
  specForModel,
  type VehicleModelReference,
} from "@/lib/fleet-onboarding/model-specs";

/**
 * What the dialog hands back on Save — the company's answers, parsed, with
 * nothing about *where* they are stored. `undefined` means the field is blank
 * (which only reaches `onSave` if validation somehow passed), never zero.
 */
export type VehicleEditorValues = {
  make: string;
  model: string;
  /** "Hino 916", or null for free text — matches `FleetDraftVehicle.prefillSource`. */
  prefillSource: string | null;
  year: number | undefined;
  plateNumber: string;
  colour: string;
  payloadKg: number | undefined;
  cargoLengthM: number | undefined;
  cargoWidthM: number | undefined;
  cargoHeightM: number | undefined;
};

/**
 * The twelve colour swatches, from the design. Stored by name, not by hex — the
 * hex is only ever painted into the little circle beside the label.
 *
 * These hex values are vehicle *data*, not UI chrome, and are deliberately
 * theme-independent: a white van is white whichever theme the operator happens
 * to be looking at it in, and "Black" has to stay `#1a1a1c` or the swatch stops
 * describing the thing it names. Do not swap them for tokens and do not add a
 * `dark:` variant to them. The only part of the swatch that *is* chrome is the
 * hairline around it, which has to keep both ends of this list separable from
 * the card behind them — see the ring at the render site.
 */
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

/** How the footer names the body type the prefill was adjusted for. */
const BODY_PHRASE: Record<ChassisType, string> = {
  DRY_BOX: "as a dry box",
  REFRIGERATED: "as a refrigerated vehicle",
  OPEN_CHASSIS: "as an open chassis",
};

/**
 * Shared chrome, matching the driver wizard's technical-details step.
 *
 * `border-border` is deliberately ABSENT, having been removed rather than left
 * alone. In light it was harmless — `--border` and `--input` are both
 * `oklch(0.922 0 0)`, so it resolved to the same edge the `Input` primitive
 * draws for itself. In dark the two part company: `--border` is white at 10%,
 * `--input` at 15%, and `tailwind-merge` was handing the weaker of the two the
 * win over the primitive's own `border-input`, leaving these fields a third
 * fainter than every other shadcn input in the app for no reason anyone chose.
 * This matters more here than on a step screen: the dialog floats over the
 * wizard, so its fields are the only edges a reader has to work with.
 * `step-2-licence.tsx`, `step-3c-technical-details.tsx` and
 * `step-4-drivers-assignment.tsx` carry the same note — the four have to stay
 * in step.
 */
const FIELD_CLASS =
  "h-[46px] rounded-[10px] bg-card px-[13px] text-[15px] focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15 md:text-[15px]";

const LABEL_CLASS =
  "text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase";

const ERROR_CLASS = "text-xs text-destructive";

/** The design's max-height for the make/model list before it scrolls. */
const LIST_MAX_HEIGHT_CLASS = "max-h-[236px]";

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

/** Free text split into a make and a model, on the first run of whitespace.
 *  Picking a row instead sets both verbatim, which is how "Mitsubishi Fuso"
 *  keeps its two-word make that re-splitting the query would get wrong. */
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

/** A whole-number field as a stored number, or `undefined` for blank. */
function parseWholeNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A metre field as a stored number, or `undefined` for blank/unparseable. */
function parseDecimalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A stored number as a field value; an absent number is an empty field. */
function wholeNumberToField(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** A stored dimension as a field value, always two decimals so a resumed row
 *  and a fresh prefill render identically in the mono field. */
function dimensionToField(value: number | undefined): string {
  return value === undefined ? "" : formatDimensionM(value);
}

/** The published spec shown on the right of each option row — the row's own
 *  dry-box figures, NOT the body-adjusted ones. The company is being shown what
 *  the manufacturer publishes; the adjustment happens when it lands in the
 *  fields. */
function formatReferenceSpec(reference: VehicleModelReference): string {
  return `${reference.payloadKg.toLocaleString("en-US")} kg · ${formatDimensionM(
    reference.cargoLengthM,
  )} × ${formatDimensionM(reference.cargoWidthM)} × ${formatDimensionM(
    reference.cargoHeightM,
  )} m`;
}

export function VehicleEditorDialog({
  open,
  onOpenChange,
  index,
  classId,
  chassisType,
  initial,
  otherPlates,
  onSave,
  onToast,
  saveError = null,
  saving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Row number shown in the title; 1-based. */
  index: number;
  classId: VehicleClassId;
  chassisType: ChassisType;
  initial: VehicleEditorValues;
  /** Plates held by the OTHER vehicles: UPPERCASED plate -> that vehicle's number. */
  otherPlates: Map<string, number>;
  /** Resolves false to keep the dialog open (e.g. the server rejected it). */
  onSave: (values: VehicleEditorValues) => boolean | Promise<boolean>;
  /**
   * Raises the caller's toast with the first failing field's message. Optional
   * because the dialog is context-free and a caller without a toast slot is a
   * legitimate mounting: every message also renders inline under its own field,
   * so nothing is lost, it is only quieter.
   */
  onToast?: (message: string, tone?: "default" | "error") => void;
  /** Inline error under the footer, for a caller whose save hit the network. */
  saveError?: string | null;
  saving?: boolean;
}): React.ReactElement {
  const fieldId = useId();
  const listId = `${fieldId}-model-list`;

  // Held as STRINGS so a half-typed "6." survives a keystroke and an emptied
  // field reads as empty rather than snapping back to zero — the same shape the
  // driver wizard's technical-details step uses.
  const [query, setQuery] = useState(() =>
    [initial.make, initial.model].filter((part) => part !== "").join(" "),
  );
  const [make, setMake] = useState(initial.make);
  const [model, setModel] = useState(initial.model);
  const [prefillSource, setPrefillSource] = useState<string | null>(
    initial.prefillSource,
  );
  const [year, setYear] = useState(() => wholeNumberToField(initial.year));
  const [plate, setPlate] = useState(initial.plateNumber);
  const [colour, setColour] = useState(initial.colour);
  const [payload, setPayload] = useState(() =>
    wholeNumberToField(initial.payloadKg),
  );
  const [length, setLength] = useState(() =>
    dimensionToField(initial.cargoLengthM),
  );
  const [width, setWidth] = useState(() =>
    dimensionToField(initial.cargoWidthM),
  );
  const [height, setHeight] = useState(() =>
    dimensionToField(initial.cargoHeightM),
  );

  const [listOpen, setListOpen] = useState(false);
  const [rawActiveIndex, setRawActiveIndex] = useState(0);
  // Messages stay hidden until the first failed Save, so a dialog opened on a
  // blank row does not greet the company with six red lines.
  const [showErrors, setShowErrors] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // `initial` is rebuilt by the caller on every render, so it can never be an
  // effect dependency — the re-seed would fire on each keystroke and clobber
  // what is being typed. Mirrored into a ref instead, and read only when the
  // dialog actually opens.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // Re-seed from `initial` whenever the dialog opens, so reopening a row (or
  // opening a different one) always starts from what is stored rather than from
  // whatever the last edit left behind.
  useEffect(() => {
    if (!open) return;

    const seed = initialRef.current;
    const seedQuery = [seed.make, seed.model]
      .filter((part) => part !== "")
      .join(" ");

    setQuery(seedQuery);
    setMake(seed.make);
    setModel(seed.model);
    setPrefillSource(seed.prefillSource);
    setYear(wholeNumberToField(seed.year));
    setPlate(seed.plateNumber);
    setColour(seed.colour);
    setPayload(wholeNumberToField(seed.payloadKg));
    setLength(dimensionToField(seed.cargoLengthM));
    setWidth(dimensionToField(seed.cargoWidthM));
    setHeight(dimensionToField(seed.cargoHeightM));

    setListOpen(false);
    setRawActiveIndex(0);
    setShowErrors(false);
  }, [open]);

  const options = useMemo(
    () => searchModelReferences(classId, query),
    [classId, query],
  );

  // Clamped rather than reset when the list shrinks under the cursor, so
  // narrowing a search never leaves the highlight pointing past the last row.
  const activeIndex = Math.min(rawActiveIndex, Math.max(options.length - 1, 0));

  // Keeps the keyboard cursor inside the scroll window. Queried by attribute
  // rather than held in a ref array, which would have to be rebuilt on every
  // keystroke as the filtered list changes length.
  useEffect(() => {
    if (!listOpen) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [listOpen, activeIndex, options.length]);

  // Close the list on a press anywhere outside its wrapper. A plain `document`
  // listener rather than a Radix `Popover`: a popover nested inside a dialog
  // fights the dialog over focus containment and outside-press handling, and
  // this list is an extension of the text box above it, not a layer of its own.
  useEffect(() => {
    if (!listOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target))
        return;
      setListOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [listOpen]);

  const vehicleClass = findVehicleClass(classId);
  const bodyLabel = findBodyType(chassisType).shortLabel;
  // The class/body default, shown as placeholder text so an empty field still
  // says what a vehicle of this kind usually measures.
  const placeholderSpec = defaultSpecForClass(chassisType, classId);
  // Recomputed per render, never captured once: a wizard left open across
  // midnight on 31 December must not reject a brand-new vehicle's year.
  const currentYear = new Date().getFullYear();

  const values: VehicleEditorValues = {
    make: make.trim(),
    model: model.trim(),
    prefillSource,
    year: parseWholeNumber(year),
    plateNumber: plate.trim(),
    colour,
    payloadKg: parseWholeNumber(payload),
    cargoLengthM: parseDecimalNumber(length),
    cargoWidthM: parseDecimalNumber(width),
    cargoHeightM: parseDecimalNumber(height),
  };

  // `validateFleetVehicle` never inspects `id` — it is on `FleetDraftVehicle`
  // because a row that exists in a draft always has one, and the row being
  // edited here may not have been saved yet.
  const candidate: FleetDraftVehicle = {
    id: "",
    chassisType,
    classId,
    make: values.make,
    model: values.model,
    year: values.year,
    plateNumber: values.plateNumber,
    colour: values.colour,
    payloadKg: values.payloadKg,
    cargoLengthM: values.cargoLengthM,
    cargoWidthM: values.cargoWidthM,
    cargoHeightM: values.cargoHeightM,
  };

  // Computed every render rather than frozen at Save time, so a message
  // disappears as soon as the company fixes the field it belongs to.
  const problems: VehicleFieldErrors = validateFleetVehicle(
    candidate,
    currentYear,
    otherPlates,
  );

  /** The message to show under `field`, or `undefined` while it stays quiet. */
  function errorFor(field: VehicleFieldKey): string | undefined {
    return showErrors ? problems[field] : undefined;
  }

  function handleQueryChange(next: string) {
    const parts = splitMakeModel(next);
    setQuery(next);
    setMake(parts.make);
    setModel(parts.model);
    // Typed text clears the prefill source: the footer would otherwise credit a
    // model that is no longer in the box. Editing payload or a dimension by hand
    // deliberately does NOT clear it — the footer's own copy invites exactly
    // that correction.
    setPrefillSource(null);
    setListOpen(true);
    setRawActiveIndex(0);
  }

  function pickReference(reference: VehicleModelReference) {
    const spec = specForModel(chassisType, classId, reference);
    const label = `${reference.make} ${reference.model}`;

    setMake(reference.make);
    setModel(reference.model);
    setQuery(label);
    setPrefillSource(label);
    setPayload(formatPayloadKg(spec.payloadKg));
    setLength(formatDimensionM(spec.cargoLengthM));
    setWidth(formatDimensionM(spec.cargoWidthM));
    setHeight(formatDimensionM(spec.cargoHeightM));

    setListOpen(false);
    setRawActiveIndex(0);
    inputRef.current?.focus();
  }

  function handleQueryKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!listOpen) {
        setListOpen(true);
        return;
      }
      if (options.length === 0) return;

      const delta = event.key === "ArrowDown" ? 1 : -1;
      // Clamped rather than wrapped: the list is short, and wrapping past the
      // last row reads as the highlight vanishing.
      setRawActiveIndex(
        Math.min(Math.max(activeIndex + delta, 0), options.length - 1),
      );
      return;
    }

    if (event.key === "Enter" && listOpen) {
      const option = options[activeIndex];
      if (option) {
        // Only swallowed when it actually picks something, so Enter on free text
        // still submits the form.
        event.preventDefault();
        pickReference(option);
      }
    }

    // Escape is handled on `DialogContent`'s `onEscapeKeyDown` instead of here:
    // Radix listens for it on `document` in the CAPTURE phase, so it has already
    // decided to close the dialog before a bubble-phase handler on this input
    // could stop it.
  }

  async function handleSave() {
    const first = firstVehicleMessage(problems);

    if (first !== null) {
      setShowErrors(true);
      setListOpen(false);
      onToast?.(first, "error");
      return;
    }

    const saved = await onSave(values);
    // A caller whose save hit the network can resolve false to keep the dialog
    // open over its own `saveError`.
    if (saved) onOpenChange(false);
  }

  const volume = useMemo(() => {
    const parsed = [length, width, height].map((value) =>
      Number.parseFloat(value),
    );
    // Shown the moment all three parse, before they pass validation: watching
    // the number move is how a centimetres-for-metres typo gets caught.
    if (parsed.some((value) => !Number.isFinite(value))) return null;
    return parsed.reduce((product, value) => product * value, 1).toFixed(1);
  }, [length, width, height]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // The content portals to `document.body`, outside the wizard's own
        // `[data-onboarding-surface]` element, so it carries the marker itself
        // — exactly as the driver flow's upload dialog does. Without it the
        // `src/components/ui` primitives inside resolve `border`/`muted`/
        // `accent` against the landing palette instead of the shadcn tokens.
        data-onboarding-surface=""
        // The primitive defaults to `sm:max-w-sm`, so the 640px override is
        // required rather than additive.
        className="w-full gap-0 rounded-2xl p-0 sm:max-w-[640px]"
        onEscapeKeyDown={(event) => {
          // Escape closes the make/model list first; it only reaches the dialog
          // once no list is open under it.
          if (listOpen) {
            event.preventDefault();
            setListOpen(false);
          }
        }}
      >
        <DialogHeader className="gap-1 border-b border-border px-[22px] pt-5 pb-4">
          <DialogTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
            Vehicle {index} — {vehicleClass.name}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5]">
            {bodyLabel} · needs licence category{" "}
            {vehicleClass.requiredLicenceCategory}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          {/* The body scrolls so a short viewport can still reach the footer. */}
          <div className="flex max-h-[calc(100dvh-6rem)] flex-col gap-4 overflow-y-auto px-[22px] py-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${fieldId}-make-model`} className={LABEL_CLASS}>
                Make and model
              </label>
              {/* Hand-rolled rather than a `Popover`: see the pointerdown effect
                  above for why a popover inside a dialog is the wrong layer. */}
              <div ref={wrapperRef} className="relative">
                <Input
                  id={`${fieldId}-make-model`}
                  ref={inputRef}
                  role="combobox"
                  autoComplete="off"
                  aria-expanded={listOpen}
                  aria-controls={listOpen ? listId : undefined}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    listOpen && options[activeIndex]
                      ? `${listId}-${activeIndex}`
                      : undefined
                  }
                  aria-invalid={errorFor("makeModel") !== undefined}
                  placeholder={`Search ${vehicleClass.name} models`}
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  onFocus={() => setListOpen(true)}
                  // Both, deliberately: focusing opens the list, and clicking an
                  // already-focused box (after a pick closed it) fires no focus
                  // event, so without this it could not be reopened without
                  // leaving the field first.
                  onClick={() => setListOpen(true)}
                  onKeyDown={handleQueryKeyDown}
                  className={FIELD_CLASS}
                />
                {listOpen ? (
                  <div
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    className={`absolute top-full left-0 z-20 mt-1.5 w-full overflow-y-auto rounded-[10px] border border-border bg-card ${LIST_MAX_HEIGHT_CLASS}`}
                  >
                    {options.length === 0 ? (
                      <p className="px-[13px] py-2.5 text-[13px] text-muted-foreground">
                        {VEHICLE_MESSAGES.noModelMatch}
                      </p>
                    ) : (
                      options.map((reference, optionIndex) => {
                        const active = optionIndex === activeIndex;

                        return (
                          <button
                            key={`${reference.make} ${reference.model}`}
                            id={`${listId}-${optionIndex}`}
                            type="button"
                            role="option"
                            aria-selected={
                              reference.make === make &&
                              reference.model === model
                            }
                            data-active={active}
                            // `onMouseDown` rather than `onClick`: the input
                            // would otherwise lose focus first and close the
                            // list out from under the click.
                            onMouseDown={(event) => {
                              event.preventDefault();
                              pickReference(reference);
                            }}
                            onMouseEnter={() => setRawActiveIndex(optionIndex)}
                            className={`flex w-full items-baseline gap-2.5 border-b border-border px-[13px] py-2.5 text-left last:border-b-0 ${
                              active ? "bg-muted" : "bg-transparent"
                            }`}
                          >
                            <span className="text-sm font-semibold">
                              {reference.make}
                            </span>
                            <span className="text-[13px] text-muted-foreground">
                              {reference.model}
                            </span>
                            <span className="ml-auto font-price text-[12px] whitespace-nowrap text-muted-foreground">
                              {formatReferenceSpec(reference)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
              {errorFor("makeModel") !== undefined ? (
                <p className={ERROR_CLASS}>{errorFor("makeModel")}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${fieldId}-year`} className={LABEL_CLASS}>
                  Year
                </label>
                <Input
                  id={`${fieldId}-year`}
                  // Text rather than `type="number"`: the design renders these in
                  // the mono face with no spinner, and a number input would also
                  // change value on a stray scroll over the field.
                  inputMode="numeric"
                  maxLength={4}
                  aria-invalid={errorFor("year") !== undefined}
                  placeholder="2021"
                  value={year}
                  onChange={(event) => setYear(digitsOnly(event.target.value))}
                  className={`${FIELD_CLASS} font-price`}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${fieldId}-plate`} className={LABEL_CLASS}>
                  Licence plate
                </label>
                <Input
                  id={`${fieldId}-plate`}
                  aria-invalid={errorFor("plate") !== undefined}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="34 ABC 128"
                  value={plate}
                  // Uppercased in state, not merely via `text-transform`, so the
                  // value that reaches the draft is the one on screen.
                  onChange={(event) =>
                    setPlate(event.target.value.toUpperCase())
                  }
                  className={`${FIELD_CLASS} font-price text-[16px] font-semibold tracking-[0.12em] md:text-[16px]`}
                />
              </div>
            </div>
            {/* Both messages render below the pair, so neither input's height
                jumps when only one of them fails. */}
            {errorFor("year") !== undefined ? (
              <p className={`${ERROR_CLASS} -mt-2`}>{errorFor("year")}</p>
            ) : null}
            {errorFor("plate") !== undefined ? (
              <p className={`${ERROR_CLASS} -mt-2`}>{errorFor("plate")}</p>
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className={LABEL_CLASS}>Colour</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COLORS.map(([name, hex]) => {
                  const selected = colour === name;

                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setColour(name)}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-2.5 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                        selected
                          ? "border-onboarding-accent bg-onboarding-accent/5"
                          : errorFor("colour") !== undefined
                            ? "border-destructive bg-card hover:bg-muted"
                            : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        style={{ background: hex }}
                        // The hairline is the only thing keeping the extremes of
                        // the list from disappearing into the card, and which
                        // extreme is at risk flips with the theme: `#ffffff` on
                        // the white card in light, `#1a1a1c` on `oklch(0.205)`
                        // in dark. Deriving it from `--foreground` rather than
                        // from a fixed black or white is what makes one class
                        // cover both cases — the ink is dark in light and light
                        // in dark, so the hairline always contrasts with the
                        // card whatever the swatch under it is doing.
                        //
                        // The alpha has to differ, though. In light the hairline
                        // is a near-black over a pure-white card, so 15% is
                        // already an obvious grey. In dark it is a near-white
                        // over `oklch(0.205)` — a card that is nowhere near
                        // black — so the same 15% barely lifts off it and the
                        // Black swatch stays lost. 30% restores the same
                        // apparent weight, and scoping it to `dark:` leaves the
                        // light swatch exactly as designed.
                        className="size-4 shrink-0 rounded-full border border-foreground/15 dark:border-foreground/30"
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
              {errorFor("colour") !== undefined ? (
                <p className={ERROR_CLASS}>{errorFor("colour")}</p>
              ) : null}
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${fieldId}-payload`} className={LABEL_CLASS}>
                Maximum payload (kg)
              </label>
              <Input
                id={`${fieldId}-payload`}
                inputMode="numeric"
                aria-invalid={errorFor("payload") !== undefined}
                placeholder={formatPayloadKg(placeholderSpec.payloadKg)}
                value={payload}
                onChange={(event) => setPayload(digitsOnly(event.target.value))}
                className={`${FIELD_CLASS} font-price`}
              />
              {errorFor("payload") !== undefined ? (
                <p className={ERROR_CLASS}>{errorFor("payload")}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2.5">
              <span className={LABEL_CLASS}>Cargo hold (metres)</span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <DimensionField
                  id={`${fieldId}-length`}
                  label="Length"
                  placeholder={formatDimensionM(placeholderSpec.cargoLengthM)}
                  value={length}
                  invalid={errorFor("dimensions") !== undefined}
                  onChange={setLength}
                />
                <DimensionField
                  id={`${fieldId}-width`}
                  label="Width"
                  placeholder={formatDimensionM(placeholderSpec.cargoWidthM)}
                  value={width}
                  invalid={errorFor("dimensions") !== undefined}
                  onChange={setWidth}
                />
                <DimensionField
                  id={`${fieldId}-height`}
                  label="Height"
                  placeholder={formatDimensionM(placeholderSpec.cargoHeightM)}
                  value={height}
                  invalid={errorFor("dimensions") !== undefined}
                  onChange={setHeight}
                />
              </div>
              {errorFor("dimensions") !== undefined ? (
                <p className={ERROR_CLASS}>{errorFor("dimensions")}</p>
              ) : null}
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {volume === null
                  ? VEHICLE_MESSAGES.volumeHint
                  : `Usable volume ${volume} m³ — used to match this vehicle with orders.`}
              </p>
            </div>
          </div>

          <DialogFooter className="m-0 flex-col items-stretch gap-3 rounded-b-2xl border-t border-border bg-muted/50 px-[22px] py-4 sm:flex-col sm:items-stretch sm:justify-start">
            {prefillSource !== null ? (
              <p className="text-xs text-muted-foreground">
                Prefilled from {prefillSource} {BODY_PHRASE[chassisType]}.
                Correct them to the real vehicle.
              </p>
            ) : null}
            {saveError !== null ? (
              <p role="alert" className="text-[13px] text-destructive">
                {saveError}
              </p>
            ) : null}
            <div className="flex items-center gap-3.5">
              {/* `text-white` on `bg-onboarding-accent` is right in both themes
                  and must not grow a `dark:` variant — the brand orange is
                  theme-independent by design, so its label is too. The Cancel
                  button beside it is all semantic tokens and needs nothing. */}
              <button
                type="submit"
                disabled={saving}
                className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save vehicle"}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-12 cursor-pointer rounded-[11px] border border-border bg-card px-5 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Cancel
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One of the three metre inputs. Never carries a red border class of its own:
 *  `aria-invalid` is set and the `Input` primitive's own `aria-invalid:`
 *  variants paint it, which a hand-written border would fight. */
function DimensionField({
  id,
  label,
  placeholder,
  value,
  invalid,
  onChange,
}: {
  id: string;
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
        className="text-[11px] font-semibold text-muted-foreground"
      >
        {label}
      </label>
      <Input
        id={id}
        inputMode="decimal"
        aria-invalid={invalid}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(decimalOnly(event.target.value))}
        className={`${FIELD_CLASS} font-price px-3`}
      />
    </div>
  );
}
