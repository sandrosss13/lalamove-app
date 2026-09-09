"use client";

import * as React from "react";

import {
  HUB_STATUS_TONE_CLASSES,
  type HubStatusTone,
} from "@/components/driver-hub/hub-status";
import type { HubLoad } from "@/components/driver-hub/screens/loads-context";
import {
  EM_DASH,
  cargoCategoryLabel,
  formatHelperRequest,
  formatLoadDims,
  formatRelativeAgo,
  formatVolumeM3,
  formatWeightKg,
  sortedHandlingTags,
} from "@/components/driver-hub/screens/loads-format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The pieces the desktop detail drawer (`loads-drawer.tsx`) and the mobile
 * detail sheet (`loads-detail-sheet.tsx`) render **identically**, so that they
 * cannot say two different things about one load.
 *
 * ## Why this module exists
 *
 * The two surfaces were written by two agents in the same wave with no ordering
 * between them, so each carried its own copy of the status maps, the pill and
 * note class strings, the route markers, the cargo table and the photo tiles.
 * Both files' doc comments called the extraction "a worthwhile follow-up"; a
 * review found that the duplication had already cost users twice, and in the
 * one direction that matters:
 *
 * - the sheet rendered **neither compliance note** — a driver on a phone, the
 *   primary device for this feature, could accept a `HAZMAT` load without ever
 *   being asked to confirm an ADR certification, which is the exact assumption
 *   `specs/driver-load-board/requirements.md` leans on when it accepts ungated
 *   hazmat as a risk ("tagged and warned about, not gated");
 * - the sheet's "Claimed by another driver." dropped the claim age the drawer
 *   renders from the same `updatedAt`.
 *
 * Both of those are *copy* divergences, not layout ones. So the rule for this
 * module is: **anything that decides what a load says goes here** — wording,
 * tone, ordering, the em-dash-versus-"None declared" distinctions — while the
 * two surfaces keep only their own chrome.
 *
 * ## What deliberately does NOT belong here
 *
 * - **Either surface's frame.** The drawer is a fixed 400px `<aside>` under a
 *   61px sticky header; the sheet is a Radix bottom panel that is portalled out
 *   of the hub's subtree and carries its own non-modal focus management. They
 *   have nothing in common but the word "panel".
 * - **The action block.** Both end in Accept/Reject, Restore, or a disabled
 *   "Open job sheet", but the drawer sizes its controls at 40px and the sheet
 *   at the mobile 44px touch floor, and the two disable Reject and Restore
 *   against different things. Only the *notes* inside that block are shared;
 *   the buttons stay where their metrics are decided. `JOB_SHEET_TITLE` is
 *   exported for the one string both buttons must agree on.
 * - **`RouteStop` itself.** The two lay a stop out differently *for a reason*:
 *   the drawer puts the time on the right of the label row and truncates the
 *   address behind a `title`, while the sheet stacks the time under a wrapped
 *   address because a phone has no hover to reveal an elided Tbilisi address.
 *   Folding both into one component behind a `layout` prop would preserve the
 *   difference while hiding the reason for it. What is shared is the part that
 *   carries a decision — the marker's geometry and the label/city pair — and
 *   those are exported separately, so each surface composes its own layout out
 *   of pieces it cannot spell differently.
 *
 * ## The money rule
 *
 * Nothing here reads, imports, derives from or renders `Order.price`. It is not
 * merely avoided: `GET /api/loads` does not select the fare columns, so
 * `HubLoad` has no `price` field and reaching for one is a compile error. The
 * headline payout is formatted at each call site, because that is where the
 * `formatGel` / `formatGelExact` choice is made — see the note on
 * `formatGelExact` in `loads-format.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Shared class strings                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The uppercase section heading above Route and Cargo.
 *
 * Exported because each surface writes its own `<h3>Cargo</h3>` — the heading
 * sits in that surface's own section frame — while the type must not drift.
 */
export const SECTION_LABEL_CLASSES =
  "text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase";

/** A pill: the status badge and the handling tags share the design's metrics. */
const PILL_CLASSES =
  "h-auto rounded-full px-[9px] py-[3px] text-[11px] font-medium " +
  "tracking-[0.02em]";

/** A boxed note in the actions block — the advisory, claimed and mine notes. */
const NOTE_CLASSES = "rounded-md border p-2.5 text-[13px] leading-relaxed";

/**
 * Why "Open job sheet" ships disabled.
 *
 * One string so the visible tooltip and the `sr-only` sentence beside it can
 * never drift apart — the same pairing `hub-online-toggle.tsx` uses for its own
 * disabled control — and one string across both surfaces so a driver is not
 * told two different things about the same missing screen.
 *
 * There is no job-sheet screen to link to and inventing one is out of scope
 * (`specs/driver-load-board/requirements.md`, Non-Goals). The gap is tracked in
 * `specs/driver-load-board/action-required.md` under "Design the job sheet".
 */
export const JOB_SHEET_TITLE =
  "Job sheet isn't built yet. Client contact details and proof of delivery " +
  "will live there.";

/* -------------------------------------------------------------------------- */
/* Status pill                                                                */
/* -------------------------------------------------------------------------- */

type LoadStatus = HubLoad["status"];

/**
 * The three row states mapped onto `hub-status.ts`'s six tones — **no seventh
 * colour pair is invented here.**
 *
 * The design draws these three pills in literal dark/grey/emerald, which are not
 * words in `TONE_BY_STATUS`'s vocabulary, so this is a small local lookup rather
 * than a `hubStatusTone()` call. `HubStatusBadge` is deliberately not reused for
 * the same reason: its `status` prop expects a word from that vocabulary, and
 * neither "Open · first to confirm" nor "Yours" is one — both would fall
 * silently through to `neutral`.
 */
const DETAIL_STATUS_TONE: Record<LoadStatus, HubStatusTone> = {
  // Urgent, and wants the driver to act now. `warning` is the closest of the six
  // (Pending / Invited / Due soon): "still fine, but it needs you to do
  // something soon" is exactly what an open, racing load is.
  available: "warning",
  // Settled and no longer actionable — `neutral`, the same tone as Offline and
  // Idle: a real, deliberate state that is not an alert.
  claimed: "neutral",
  // The state the driver wants. `success`, the family the design's own emerald
  // pill implies.
  mine: "success",
};

const DETAIL_STATUS_LABEL: Record<LoadStatus, string> = {
  available: "Open · first to confirm",
  claimed: "Claimed",
  mine: "Yours",
};

/**
 * The status pill in either detail header.
 *
 * `className` exists for one reason: the drawer's badge sits inside a
 * `flex-none` wrapper it shares with the ✕ button, and the sheet's is a direct
 * flex child that has to declare `flex-none` itself. Everything that decides
 * what the pill *says* — the tone and the label — is fixed here.
 */
export function LoadStatusPill({
  status,
  className,
}: {
  status: LoadStatus;
  className?: string;
}) {
  return (
    <Badge
      // `outline` so no variant background survives the merge if a tone class is
      // ever missing — the same reason `HubStatusBadge` uses it.
      variant="outline"
      className={cn(
        PILL_CLASSES,
        "border-transparent",
        HUB_STATUS_TONE_CLASSES[DETAIL_STATUS_TONE[status]],
        className,
      )}
    >
      {/* A rejected load keeps the "available" pill and label: rejecting hides
          the row from this driver's board and changes nothing about the load's
          real status, so there is nothing new for the pill to represent. */}
      {DETAIL_STATUS_LABEL[status]}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

/** Filled for the pick-up, a hollow ring for the drop-off. */
export type RouteStopMarkerKind = "filled" | "ring";

/**
 * The dot beside one end of the trip.
 *
 * Both markers are 8px. The drop-off's 2px ring reads as the same visual weight
 * as the pick-up's filled dot at that size, which is why the design uses a ring
 * rather than a smaller or lighter fill to distinguish them. `bg-primary` /
 * `border-primary` rather than the design's literal `oklch(0.205 0 0)`: inside
 * `[data-admin-surface]` that token *is* that colour, and going through it keeps
 * both detail surfaces free of colour literals that no other hub file would know
 * to change.
 */
export function RouteStopMarker({ marker }: { marker: RouteStopMarkerKind }) {
  return (
    // Decorative: the "PICK-UP"/"DROP-OFF" label beside it already says which
    // end this is, and a dot announced as "circle" tells a reader nothing.
    <span
      aria-hidden="true"
      className={cn(
        "mt-[5px] size-2 flex-none rounded-full",
        marker === "filled"
          ? "bg-primary"
          : "border-2 border-primary bg-transparent",
      )}
    />
  );
}

/**
 * The "PICK-UP · Tbilisi" pair at the top of a stop.
 *
 * `min-w-0` so the city truncates instead of pushing the drawer's time column
 * off the row; it is inert in the sheet, where this is a block child rather than
 * a flex item. The em dash is the city fallback for a pick-up the geocoder could
 * not place — the address below still identifies the stop.
 */
export function RouteStopHeading({
  label,
  city,
}: {
  /** "Pick-up" or "Drop-off" — rendered uppercase by CSS, not by the string. */
  label: string;
  /** Already-humanised city label, or null when the geocoder could not place it. */
  city: string | null;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className={cn(SECTION_LABEL_CLASSES, "flex-none")}>{label}</span>
      <span className="truncate text-xs font-medium">{city ?? EM_DASH}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cargo                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The eight cargo rows, in the design's order.
 *
 * Built as data rather than as eight hand-written `<dt>`/`<dd>` pairs so the
 * grid's alignment cannot drift row to row, and so the order is one list to read
 * rather than eighty lines of markup to scan.
 *
 * There is no Body type row — the booked chassis appears only in the cold-chain
 * mismatch note below, where it is the point rather than a detail.
 */
function cargoRows(load: HubLoad): { key: string; value: string }[] {
  const tags = sortedHandlingTags(load.handlingTags);
  const dims = {
    lengthM: load.cargoLengthM,
    widthM: load.cargoWidthM,
    heightM: load.cargoHeightM,
  };

  return [
    { key: "Type", value: cargoCategoryLabel(load.cargoCategory) },
    { key: "Weight", value: formatWeightKg(load.cargoWeightKg) },
    { key: "Dimensions", value: formatLoadDims(dims) },
    { key: "Volume", value: formatVolumeM3(dims) },
    { key: "Packaging", value: load.packagingDescription ?? EM_DASH },
    { key: "Quantity", value: load.itemQuantity ?? EM_DASH },
    {
      key: "Handling",
      // "None declared" rather than an em dash: the client was asked and said
      // nothing applied, which is a different fact from a value being missing.
      value:
        tags.length === 0
          ? "None declared"
          : tags.map((tag) => tag.label).join(", "),
    },
    { key: "Helpers", value: formatHelperRequest(load.helperCount) },
  ];
}

/** The cargo specification, as a two-column definition list. */
export function CargoSpecList({ load }: { load: HubLoad }) {
  return (
    <dl className="mt-2 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[13px]">
      {cargoRows(load).map((row) => (
        <React.Fragment key={row.key}>
          <dt className="text-muted-foreground">{row.key}</dt>
          <dd className="min-w-0 break-words">{row.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/**
 * The handling tags as pills, under the cargo table.
 *
 * Sorted by `CargoHandlingTag` declaration order, never by the order they sit in
 * `Order.handlingTags` — the booking form appends those in whatever order the
 * chips were tapped, so two loads carrying the same three tags would otherwise
 * show them in different sequences. `sortedHandlingTags` is the one place that
 * ordering is defined.
 *
 * Absent entirely at zero tags: the Handling row above already reads "None
 * declared", and an empty pill row would be a blank line under it.
 */
export function HandlingTagPills({ load }: { load: HubLoad }) {
  const tags = sortedHandlingTags(load.handlingTags);

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.value}
          className={cn(
            PILL_CLASSES,
            "border border-border bg-muted text-muted-foreground",
          )}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The three cargo-photo tiles.
 *
 * **Permanent dashed placeholders.** There is no cargo photo upload anywhere in
 * the client booking flow to feed them and `GET /api/loads` carries no photo
 * field at all, so the count is a constant and no field on the row is consulted
 * to decide it. `specs/driver-load-board/requirements.md`'s Non-Goals: "No cargo
 * photos… Do not add one." Do not build an upload control here, and do not
 * remove the tiles for a load with no photos — every load has no photos, and
 * that is the permanent state of this feature.
 */
const PHOTO_TILES = ["Photo 1", "Photo 2", "Photo 3"];

export function CargoPhotoTiles() {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {PHOTO_TILES.map((label) => (
        <div
          key={label}
          className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-border bg-muted text-[10px] text-muted-foreground"
        >
          {label}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The two compliance advisories, above whichever state block the surface shows.
 *
 * **Both surfaces must render this, and it is one component so that they
 * cannot render different halves of it.** The mobile sheet shipped without
 * either note, which is the failure the sheet exists to prevent: the tag pill
 * says "Hazmat", but the sentence telling the driver to verify their ADR
 * certification was desktop-only, on a feature whose primary device is a phone.
 *
 * ## What these notes are, and are not
 *
 * - **Hazmat is advisory, never enforcement.** Nothing in the schema gates it:
 *   `DriverLicence` carries no certification field, so any licensed driver can
 *   claim a hazmat load whether or not they hold a valid ADR certification. The
 *   note asks them to confirm it themselves. See
 *   `specs/driver-load-board/requirements.md`'s Non-Goals ("Hazmat loads are
 *   tagged and warned about, not gated") and the real compliance exposure this
 *   leaves, tracked in `specs/driver-load-board/action-required.md` under "Gate
 *   hazmat loads on driver certification".
 * - **Cold chain and body type are two different questions.** A `COLD_CHAIN`
 *   handling tag is a property of the **cargo** — what the client says the goods
 *   need. `bodyType` (`ChassisType`) is a property of the **vehicle body** the
 *   client picked and paid for at booking. They can disagree: a client can
 *   declare cold-chain cargo without having booked a refrigerated body, and
 *   `null` (no body type declared at all) is the common case on older orders.
 *   `null` therefore counts as a mismatch rather than as "probably fine" — an
 *   undeclared body is exactly the case where the driver most needs to check.
 *   The same reasoning is recorded on the `CargoHandlingTag` enum in
 *   `prisma/schema.prisma`.
 *
 * Additive on top of the state block that follows it, not a replacement for it:
 * a hazmat load that is already claimed still warrants the note, and a driver
 * reading it should see both.
 */
export function LoadComplianceNotes({ load }: { load: HubLoad }) {
  const hasHazmat = load.handlingTags.includes("HAZMAT");
  const hasColdChainMismatch =
    load.handlingTags.includes("COLD_CHAIN") &&
    load.bodyType !== "REFRIGERATED";

  return (
    <>
      {hasHazmat ? (
        <p
          className={cn(
            NOTE_CLASSES,
            "border-transparent",
            HUB_STATUS_TONE_CLASSES.warning,
          )}
        >
          Hazmat cargo. Confirm you and your vehicle hold a valid ADR
          certification before accepting — this isn&apos;t checked
          automatically.
        </p>
      ) : null}

      {hasColdChainMismatch ? (
        <p
          className={cn(
            NOTE_CLASSES,
            "border-transparent",
            HUB_STATUS_TONE_CLASSES.neutral,
          )}
        >
          This load needs cold-chain handling, but wasn&apos;t booked with a
          refrigerated body. Confirm your vehicle can keep it cold before
          accepting.
        </p>
      ) : null}
    </>
  );
}

/**
 * "Claimed by another driver 4 min ago. No longer available."
 *
 * The age is not decorative and not optional: it is the difference between a
 * driver believing the board is stale and knowing the load went seconds ago.
 * The sheet shipped with the unqualified sentence while the drawer carried the
 * age, from the same field — which is why the sentence lives in one place now.
 *
 * `updatedAt` is the claim instant on a `"claimed"` row: it is the only thing
 * that moves a row into that bucket — see the `CLAIMED_BY_OTHERS_STATUSES`
 * branch in `src/app/api/loads/route.ts` — and `HubLoad` documents it as such.
 * It degrades to the unqualified sentence rather than to a wrong number if the
 * timestamp is unusable or in the future: `formatRelativeAgo` answers `null` in
 * both cases, which is exactly the fallback this line wants and the reason the
 * shared helper returns the fragment unprefixed rather than the table's
 * "posted …" phrasing.
 *
 * `nowIso` is a parameter rather than a `useLoadsBoard()` read so that this note
 * measures against the same instant as the surface around it — the sheet threads
 * one clock down from `loads-mobile.tsx` so the card behind it and the sheet
 * cannot disagree.
 */
export function ClaimedElsewhereNote({
  load,
  nowIso,
}: {
  load: HubLoad;
  nowIso: string;
}) {
  const claimedAgo = formatRelativeAgo(load.updatedAt, nowIso);

  return (
    <p className={cn(NOTE_CLASSES, "border-border bg-muted")}>
      {claimedAgo === null
        ? "Claimed by another driver. No longer available."
        : `Claimed by another driver ${claimedAgo}. No longer available.`}
    </p>
  );
}

/**
 * The note above the disabled "Open job sheet" button on a load the driver owns.
 *
 * Takes no props: it is one fixed sentence whose only job is to be the same
 * sentence on both surfaces. The button under it is not shared — its height is
 * decided per surface — but `JOB_SHEET_TITLE` is.
 */
export function ClaimedByYouNote() {
  return (
    <p
      className={cn(
        NOTE_CLASSES,
        "border-transparent",
        HUB_STATUS_TONE_CLASSES.success,
      )}
    >
      You claimed this load. Contact details are in your job sheet.
    </p>
  );
}
