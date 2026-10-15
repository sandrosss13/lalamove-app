"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import {
  PICK_CARD_IDLE_CLASSES,
  PICK_CARD_SELECTED_CLASSES,
} from "@/components/home/booking-form-primitives";
import {
  HELPER_COUNT_OPTIONS,
  HELPER_TIME_NOTE_VALUES,
  parseFloorInput,
  type HelperTimeNoteValues,
  type LocationHelp,
} from "@/components/home/booking-pricing";

/**
 * Pricing model v1's helper step: the crew, the floor and the cargo elevator,
 * asked separately at the pickup and at the drop-off — the two ends are priced
 * separately (`helperStandardFee` per location), and "two helpers to load on
 * the ground floor, nobody to unload" is an ordinary job.
 *
 * Each end is a row of five numeral cells (0 = the driver alone) — the same
 * native-radio-behind-a-cell control the single helper picker used to be, so
 * the group keeps its arrow-key handling and its "3 of 5" announcement — and,
 * only once at least one helper is booked there, a floor field and a "cargo
 * elevator available" checkbox. Those two only price helpers, so with nobody
 * to carry they are hidden rather than left to be filled in for nothing; the
 * form keeps whatever was typed (re-adding a helper brings it back) and
 * `normaliseLocationHelp` sends ground floor / no elevator for an empty end.
 */

/** One numeral cell — see the comment on the old `HELPER_OPTION_CLASSES`. */
const HELPER_OPTION_CLASSES =
  "relative flex h-11 cursor-pointer items-center justify-center rounded-xl border font-price text-sm font-semibold transition-colors has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20";

const FIELD_LABEL_CLASSES = "text-xs font-medium text-paper";

export type HelperEnd = "pickup" | "dropoff";

export function HelperLocationsField({
  pickup,
  dropoff,
  onChange,
  disabled = false,
  suggestion = null,
  timeNote = HELPER_TIME_NOTE_VALUES,
}: {
  pickup: LocationHelp;
  dropoff: LocationHelp;
  onChange: (end: HelperEnd, next: LocationHelp) => void;
  disabled?: boolean;
  /** A "2 people recommended for…" hint, shown while no end has a helper. */
  suggestion?: string | null;
  /**
   * The helper-time rules the note quotes: the live ones from the latest
   * quote (`helperTimeNoteValues`), the engine defaults until then.
   */
  timeNote?: HelperTimeNoteValues;
}): React.ReactElement {
  const t = useTranslations("home.bookingForm");
  const anyHelpers = pickup.helpers > 0 || dropoff.helpers > 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem] font-medium text-paper">{t("helpers")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <HelperLocation
          end="pickup"
          title={t("helpersAtPickup")}
          value={pickup}
          onChange={(next) => onChange("pickup", next)}
          disabled={disabled}
        />
        <HelperLocation
          end="dropoff"
          title={t("helpersAtDropoff")}
          value={dropoff}
          onChange={(next) => onChange("dropoff", next)}
          disabled={disabled}
        />
      </div>

      <p className="text-xs leading-snug text-muted">
        {t("helpersPerLocationHint", {
          minutes: timeNote.includedMinutes,
          fee: timeNote.fee,
          increment: timeNote.incrementMinutes,
        })}
      </p>

      {/* A suggestion, never a change: the selection stays where the client
          left it, and the line goes as soon as a helper is added anywhere. */}
      {!anyHelpers && suggestion !== null ? (
        <p className="text-xs leading-snug text-muted">{suggestion}</p>
      ) : null}
    </div>
  );
}

function HelperLocation({
  end,
  title,
  value,
  onChange,
  disabled,
}: {
  end: HelperEnd;
  title: string;
  value: LocationHelp;
  onChange: (next: LocationHelp) => void;
  disabled: boolean;
}) {
  const t = useTranslations("home.bookingForm");
  // The shared radio `name` binding this end's five cells into one group.
  const groupName = useId();
  const floorId = useId();
  const elevatorId = useId();

  return (
    <fieldset
      className="flex flex-col gap-2.5 rounded-xl border border-line px-3 py-3"
      data-helper-end={end}
      disabled={disabled}
    >
      {/* The visible title is short ("At pickup"); the group's spoken name
          says what is being chosen there too. */}
      <legend className="sr-only">{`${t("helpers")} — ${title}`}</legend>
      <p aria-hidden="true" className="text-[0.8125rem] font-medium text-paper">
        {title}
      </p>

      <div className="grid grid-cols-5 gap-1.5">
        {HELPER_COUNT_OPTIONS.map((count) => {
          const selected = count === value.helpers;
          return (
            <label
              key={count}
              className={`${HELPER_OPTION_CLASSES} ${
                selected
                  ? `${PICK_CARD_SELECTED_CLASSES} text-accent`
                  : `${PICK_CARD_IDLE_CLASSES} text-paper`
              }`}
            >
              <input
                type="radio"
                name={groupName}
                value={count}
                checked={selected}
                onChange={() => onChange({ ...value, helpers: count })}
                aria-label={
                  count === 0
                    ? t("helperCountNone")
                    : t("helperCountSome", { count })
                }
                className="sr-only"
              />
              <span aria-hidden="true">{count}</span>
            </label>
          );
        })}
      </div>

      {value.helpers > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor={floorId} className={FIELD_LABEL_CLASSES}>
              {t("floorLabel")}
            </label>
            <input
              id={floorId}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={3}
              value={String(value.floor)}
              onChange={(event) =>
                onChange({
                  ...value,
                  floor: parseFloorInput(event.target.value),
                })
              }
              onFocus={(event) => event.target.select()}
              aria-describedby={`${floorId}-hint`}
              className="h-9 w-14 rounded-lg border border-line bg-transparent px-2 text-center font-price text-sm text-paper tabular-nums outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20"
            />
            <span id={`${floorId}-hint`} className="text-xs text-muted">
              {t("floorHint")}
            </span>
          </div>

          <label
            htmlFor={elevatorId}
            className={`${FIELD_LABEL_CLASSES} flex cursor-pointer items-center gap-2`}
          >
            <input
              id={elevatorId}
              type="checkbox"
              checked={value.cargoElevator}
              onChange={(event) =>
                onChange({ ...value, cargoElevator: event.target.checked })
              }
              className="size-4 cursor-pointer accent-accent"
            />
            {t("cargoElevatorAvailable")}
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}
