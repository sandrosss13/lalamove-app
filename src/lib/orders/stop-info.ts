/**
 * A stop's "Contact Info" as display rows — building, entrance, floor,
 * elevators, the client's comment, and (older orders only) the legacy
 * free-text details — shared by every surface that shows a stop: the client's
 * order page and checkout, the admin order detail and the web driver hub.
 *
 * Each surface keeps its own layout and only asks this module WHAT to show and
 * in which order, so the rule for when a floor is worth printing lives once.
 * No money here, ever: it is read on carrier surfaces.
 *
 * Pure and dependency-free (a structural translator), so client components and
 * the Playwright pure specs can import it. Labels come from `common.stopInfo`.
 */

import type { Translator } from "@/i18n/translator";

/** The stop columns this module reads. Contact-redacted parts arrive null. */
export type StopInfo = {
  buildingName: string | null;
  entrance: string | null;
  floor: number;
  cargoElevator: boolean;
  passengerElevator: boolean;
  comment: string | null;
  /** LEGACY "block, floor or room" free text (orders booked before 2026-10). */
  details: string | null;
};

export type StopInfoRowKey =
  "building" | "entrance" | "floor" | "elevator" | "comment" | "details";

export type StopInfoRow = {
  key: StopInfoRowKey;
  label: string;
  value: string;
  /** Free text that may span lines (render with `whitespace-pre-line`). */
  multiline: boolean;
};

function present(text: string | null | undefined): text is string {
  return typeof text === "string" && text.trim().length > 0;
}

/**
 * Whether the stop's floor says anything. `floor` defaults to 0 on every
 * order, so a bare ground floor is only printed when the stop carries other
 * structured info (building, entrance or an elevator) that makes it a real
 * answer rather than a column default.
 */
export function stopFloorIsInformative(info: StopInfo): boolean {
  return (
    info.floor > 0 ||
    present(info.buildingName) ||
    present(info.entrance) ||
    info.cargoElevator ||
    info.passengerElevator
  );
}

/**
 * The rows to show, in reading order. Empty parts are omitted, never printed
 * as dashes. `includeWork: false` leaves out the floor and the elevators for a
 * surface that already prints them on its helper-work line.
 *
 * `t` is `useTranslations("common.stopInfo")` (or the server equivalent).
 */
export function stopInfoRows(
  info: StopInfo,
  t: Translator,
  { includeWork = true }: { includeWork?: boolean } = {},
): StopInfoRow[] {
  const rows: StopInfoRow[] = [];

  if (present(info.buildingName)) {
    rows.push({
      key: "building",
      label: t("building"),
      value: info.buildingName.trim(),
      multiline: false,
    });
  }
  if (present(info.entrance)) {
    rows.push({
      key: "entrance",
      label: t("entrance"),
      value: info.entrance.trim(),
      multiline: false,
    });
  }
  if (includeWork && stopFloorIsInformative(info)) {
    rows.push({
      key: "floor",
      label: t("floor"),
      value:
        info.floor === 0
          ? t("groundFloor")
          : t("floorValue", { floor: info.floor }),
      multiline: false,
    });
  }
  if (includeWork && (info.passengerElevator || info.cargoElevator)) {
    const kinds: string[] = [];
    if (info.passengerElevator) {
      kinds.push(t("passengerElevator"));
    }
    if (info.cargoElevator) {
      kinds.push(t("cargoElevator"));
    }
    rows.push({
      key: "elevator",
      label: t("elevator"),
      value: kinds.join(", "),
      multiline: false,
    });
  }
  if (present(info.comment)) {
    rows.push({
      key: "comment",
      label: t("comment"),
      value: info.comment.trim(),
      multiline: true,
    });
  }
  if (present(info.details)) {
    rows.push({
      key: "details",
      label: t("details"),
      value: info.details.trim(),
      multiline: true,
    });
  }
  return rows;
}

/** The pickup or drop-off `StopInfo` of an order-shaped row. */
export function stopInfoOf(
  order: {
    pickupBuildingName: string | null;
    pickupEntrance: string | null;
    pickupFloor: number;
    pickupCargoElevator: boolean;
    pickupPassengerElevator: boolean;
    pickupComment: string | null;
    pickupContactDetails: string | null;
    dropoffBuildingName: string | null;
    dropoffEntrance: string | null;
    dropoffFloor: number;
    dropoffCargoElevator: boolean;
    dropoffPassengerElevator: boolean;
    dropoffComment: string | null;
    dropoffContactDetails: string | null;
  },
  stop: "pickup" | "dropoff",
): StopInfo {
  return stop === "pickup"
    ? {
        buildingName: order.pickupBuildingName,
        entrance: order.pickupEntrance,
        floor: order.pickupFloor,
        cargoElevator: order.pickupCargoElevator,
        passengerElevator: order.pickupPassengerElevator,
        comment: order.pickupComment,
        details: order.pickupContactDetails,
      }
    : {
        buildingName: order.dropoffBuildingName,
        entrance: order.dropoffEntrance,
        floor: order.dropoffFloor,
        cargoElevator: order.dropoffCargoElevator,
        passengerElevator: order.dropoffPassengerElevator,
        comment: order.dropoffComment,
        details: order.dropoffContactDetails,
      };
}

/**
 * A `StopInfo` from a stop's contact parts plus its `StopWork`-shaped floor
 * and elevators — the shape the driver hub and the mobile API carry.
 */
export function stopInfoFromParts(
  contact: {
    buildingName: string | null;
    entrance: string | null;
    comment: string | null;
    details: string | null;
  },
  work: { floor: number; cargoElevator: boolean; passengerElevator: boolean },
): StopInfo {
  return {
    buildingName: contact.buildingName,
    entrance: contact.entrance,
    floor: work.floor,
    cargoElevator: work.cargoElevator,
    passengerElevator: work.passengerElevator,
    comment: contact.comment,
    details: contact.details,
  };
}
