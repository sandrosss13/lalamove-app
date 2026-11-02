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
 * Pricing model v1's helper step: the crew, the floor and the elevators,
 * asked separately at the pickup and at the drop-off — the two ends are priced
 * separately (`helperStandardFee` per location), and "two helpers to load on
 * the ground floor, nobody to unload" is an ordinary job.
 *
 * Each end is a row of five numeral cells (0 = the driver alone) — the same
 * native-radio-behind-a-cell control the single helper picker used to be, so
 * the group keeps its arrow-key handling and its "3 of 5" announcement — then
 * the floor and two checkboxes, "Passenger elevator" and "Cargo elevator".
 *
 * The elevators are always shown (default unticked): they are useful to the
 * driver whatever the crew, and either one earns the elevator discount when
 * helpers are booked there. The floor depends on the account type: a business
 * types it here; an individual types it in the stop's Contact Info dialog
 * (`floorInContactInfo`), so this step only echoes it, as a button that opens
 * that dialog (`onEditContactInfo`).
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
  floorInContactInfo = false,
  onEditContactInfo,
}: {
  pickup: LocationHelp;
  dropoff: LocationHelp;
  onChange: (end: HelperEnd, next: LocationHelp) => void;
  disabled?: boolean;
  /**
   * True for an individual: the floor is asked in the Contact Info dialog,
   * so this step shows it read-only instead of a floor field.
   */
  floorInContactInfo?: boolean;
  /** Opens the stop's Contact Info dialog (individuals' floor). */
  onEditContactInfo?: (end: HelperEnd) => void;
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
          floorInContactInfo={floorInContactInfo}
          onEditContactInfo={
            onEditContactInfo ? () => onEditContactInfo("pickup") : undefined
          }
        />
        <HelperLocation
          end="dropoff"
          title={t("helpersAtDropoff")}
          value={dropoff}
          onChange={(next) => onChange("dropoff", next)}
          disabled={disabled}
          floorInContactInfo={floorInContactInfo}
          onEditContactInfo={
            onEditContactInfo ? () => onEditContactInfo("dropoff") : undefined
          }
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
  floorInContactInfo,
  onEditContactInfo,
}: {
  end: HelperEnd;
  title: string;
  value: LocationHelp;
  onChange: (next: LocationHelp) => void;
  disabled: boolean;
  floorInContactInfo: boolean;
  onEditContactInfo?: () => void;
}) {
  const t = useTranslations("home.bookingForm");
  // The shared radio `name` binding this end's five cells into one group.
  const groupName = useId();
  const floorId = useId();
  const elevatorId = useId();
  const passengerElevatorId = useId();
  const floorEcho =
    value.floor === 0
      ? t("groundFloorFromContactInfo")
      : t("floorFromContactInfo", { floor: value.floor });

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

      <div className="flex flex-col gap-2">
        {floorInContactInfo ? (
          onEditContactInfo ? (
            <button
              type="button"
              onClick={onEditContactInfo}
              className="w-fit text-left text-xs text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-paper"
            >
              {floorEcho}
            </button>
          ) : (
            <p className="text-xs text-muted">{floorEcho}</p>
          )
        ) : (
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
        )}

        {/* Always shown, default unticked: the driver reads them whatever the
            crew, and either one discounts the helpers booked here. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label
            htmlFor={passengerElevatorId}
            className={`${FIELD_LABEL_CLASSES} flex cursor-pointer items-center gap-2`}
          >
            <input
              id={passengerElevatorId}
              type="checkbox"
              checked={value.passengerElevator}
              onChange={(event) =>
                onChange({ ...value, passengerElevator: event.target.checked })
              }
              className="size-4 cursor-pointer accent-accent"
            />
            {t("passengerElevatorAvailable")}
          </label>

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
      </div>
    </fieldset>
  );
}
