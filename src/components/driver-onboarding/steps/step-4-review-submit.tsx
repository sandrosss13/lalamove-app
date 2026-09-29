"use client";

/**
 * Step 4 — review & submit: the summary cards and the submit CTA.
 *
 * Every row here reads straight out of `useOnboardingDraft()`'s in-memory
 * draft; there is deliberately no fetch on this screen. The draft is already
 * the exact thing the server will validate (the debounced `PATCH` saved it),
 * so re-reading it would only add a spinner between the driver and the button
 * they came here to press.
 *
 * Nothing here is authoritative. Every rule these values had to pass is
 * re-checked by `POST /api/driver-profile/onboarding/submit` against the saved
 * draft — this screen shows what is about to be sent, it does not gate it.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  ONBOARDING_SCREENS,
  useOnboardingDraft,
  type OnboardingDocument,
  type OnboardingDocumentType,
} from "@/components/driver-onboarding/onboarding-draft-context";
import type { OnboardingDraftV1 } from "@/lib/driver-onboarding/draft-schema";
import {
  findVehicleClass,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

const SUBMIT_ENDPOINT = "/api/driver-profile/onboarding/submit";

const SUBMIT_ERROR_FALLBACK =
  "We couldn't submit your application. Check your connection and try again.";

/** Placeholder for a row the draft has nothing for, per the design. */
const EMPTY_VALUE = "—";

/**
 * Display names for the three cargo body types, matching the design's step-3a
 * cards. Held here rather than imported from the step-3 component: this is the
 * only other place that renders them, and a summary row must not depend on a
 * sibling *screen* staying mounted or keeping its internal constants exported.
 */
// Keys in the `common.shared` namespace.
const CHASSIS_LABEL_KEYS: Record<string, string> = {
  DRY_BOX: "dryBox",
  REFRIGERATED: "refrigeratedVehicle",
  OPEN_CHASSIS: "openChassis",
};

/** Short month names, so dates format identically in every driver's browser. */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The two documents the licence card counts. */
const LICENCE_DOCUMENT_TYPES: OnboardingDocumentType[] = [
  "LICENCE_FRONT",
  "LICENCE_BACK",
];

type SummaryRow = { label: string; value: string };

/**
 * A `next-intl` translator, passed into the row builders below: they are plain
 * functions rather than components, so they cannot call `useTranslations`
 * themselves. `tShared` is scoped to `common.shared`, `t` to this step's own
 * `onboarding.step4ReviewSubmit` namespace, `tRoot` to the catalog root.
 */
type Translate = (key: string) => string;

type SummaryCard = {
  title: string;
  /** The screen this card's Edit link jumps back to. */
  editStep: number;
  rows: SummaryRow[];
};

/**
 * Formats a stored `YYYY-MM-DD` date for display, reading the parts out of the
 * string rather than through `Date`.
 *
 * Deliberate: `new Date("1990-05-12")` is UTC midnight, so formatting it in any
 * timezone west of Greenwich renders the *previous* day — which on a date of
 * birth or a licence expiry is the kind of off-by-one a driver would rightly
 * report as a bug.
 */
function formatDate(value: string | undefined): string | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return null;

  return `${Number(day)} ${monthName} ${year}`;
}

/** "TBILISI" → "Tbilisi", via the same option list the city picker uses. */
function formatCityValue(value: string | undefined): string | null {
  if (!value) return null;

  const option = GEORGIAN_CITY_OPTIONS.find((entry) => entry.value === value);
  return option?.label ?? null;
}

/** Groups the digits of a number for display, e.g. `1400` → "1,400". */
function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Renders `value` if it is usable, otherwise the design's em-dash placeholder. */
function orPlaceholder(value: string | null | undefined): string {
  return value !== null && value !== undefined && value !== ""
    ? value
    : EMPTY_VALUE;
}

/** True when a live document of this type has been uploaded. */
function hasDocument(
  documents: OnboardingDocument[],
  type: OnboardingDocumentType,
): boolean {
  return documents.some((document) => document.type === type);
}

/** The personal-information card's rows, in the design's order. */
function buildPersonalRows(
  draft: OnboardingDraftV1,
  documents: OnboardingDocument[],
  tShared: Translate,
): SummaryRow[] {
  const personal = draft.personal ?? {};

  return [
    { label: tShared("name"), value: orPlaceholder(personal.fullName) },
    { label: tShared("idNumber"), value: orPlaceholder(personal.idNumber) },
    {
      label: tShared("dateOfBirth"),
      value: orPlaceholder(formatDate(personal.dateOfBirth)),
    },
    { label: tShared("mobile"), value: orPlaceholder(personal.phone) },
    {
      label: tShared("city"),
      value: orPlaceholder(formatCityValue(personal.city)),
    },
    {
      label: tShared("profilePhoto"),
      value: hasDocument(documents, "PROFILE_PHOTO") ? "Uploaded" : "Missing",
    },
  ];
}

/** The licence card's rows. */
function buildLicenceRows(
  draft: OnboardingDraftV1,
  documents: OnboardingDocument[],
  t: Translate,
  tShared: Translate,
): SummaryRow[] {
  const licence = draft.licence ?? {};
  const uploadedCount = LICENCE_DOCUMENT_TYPES.filter((type) =>
    hasDocument(documents, type),
  ).length;

  return [
    { label: t("number"), value: orPlaceholder(licence.licenceNumber) },
    {
      label: tShared("expires"),
      value: orPlaceholder(formatDate(licence.expiresAt)),
    },
    {
      label: tShared("categories"),
      value: orPlaceholder(licence.categories?.join(", ")),
    },
    {
      label: tShared("photos"),
      value: `${uploadedCount} of ${LICENCE_DOCUMENT_TYPES.length}`,
    },
  ];
}

/** The vehicle card's rows. */
function buildVehicleRows(
  draft: OnboardingDraftV1,
  tShared: Translate,
  tRoot: Translate,
): SummaryRow[] {
  const vehicle = draft.vehicle ?? {};

  // Guarded rather than called straight: `findVehicleClass` throws on an
  // unknown id, and a half-filled draft legitimately has no class yet.
  const className = vehicle.classId
    ? tRoot(findVehicleClass(vehicle.classId as VehicleClassId).nameKey)
    : null;

  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ");

  const yearColour =
    vehicle.year || vehicle.colour
      ? `${orPlaceholder(vehicle.year?.toString())} · ${orPlaceholder(vehicle.colour)}`
      : null;

  const cargoHold =
    vehicle.cargoLengthM && vehicle.cargoWidthM && vehicle.cargoHeightM
      ? `${vehicle.cargoLengthM} × ${vehicle.cargoWidthM} × ${vehicle.cargoHeightM} m`
      : null;

  const chassisLabelKey = vehicle.chassisType
    ? CHASSIS_LABEL_KEYS[vehicle.chassisType]
    : undefined;

  return [
    { label: tShared("class"), value: orPlaceholder(className) },
    {
      label: tShared("body"),
      value: orPlaceholder(chassisLabelKey ? tShared(chassisLabelKey) : null),
    },
    { label: tShared("makeModel"), value: orPlaceholder(makeModel) },
    { label: tShared("yearColour"), value: orPlaceholder(yearColour) },
    { label: tShared("plate"), value: orPlaceholder(vehicle.plateNumber) },
    {
      label: tShared("payload"),
      value: orPlaceholder(
        vehicle.payloadKg ? `${formatNumber(vehicle.payloadKg)} kg` : null,
      ),
    },
    { label: tShared("cargoHold"), value: orPlaceholder(cargoHold) },
  ];
}

export function Step4ReviewSubmit() {
  const { draft, documents, goToStep, refetch } = useOnboardingDraft();
  const t = useTranslations("onboarding.step4ReviewSubmit");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cards: SummaryCard[] = [
    {
      title: t("personalInformation"),
      editStep: ONBOARDING_SCREENS.personal,
      rows: buildPersonalRows(draft, documents, tShared),
    },
    {
      title: t("driverSLicence"),
      editStep: ONBOARDING_SCREENS.licence,
      rows: buildLicenceRows(draft, documents, t, tShared),
    },
    {
      title: tShared("vehicle"),
      editStep: ONBOARDING_SCREENS.vehicleBodyAndClass,
      rows: buildVehicleRows(draft, tShared, tRoot),
    },
  ];

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    let response: Response;
    try {
      // No body on purpose: the server validates its own saved copy of the
      // draft, so there is nothing left for this screen to send.
      response = await fetch(SUBMIT_ENDPOINT, { method: "POST" });
    } catch {
      setSubmitError(SUBMIT_ERROR_FALLBACK);
      setSubmitting(false);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setSubmitError(payload?.error ?? SUBMIT_ERROR_FALLBACK);
      setSubmitting(false);
      return;
    }

    // The shell swaps this whole wizard for the status screen as soon as the
    // refetched `status` is no longer "DRAFT", so `submitting` is deliberately
    // left set: the button stays disabled for the moment before it unmounts,
    // rather than flicking back to "Submit application".
    await refetch();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
        {t("checkEverythingBeforeItGoesTo")}
      </p>

      {cards.map((card) => (
        <section
          key={card.title}
          className="overflow-hidden rounded-[13px] border border-border bg-card"
        >
          {/* `bg-secondary/40` rather than `bg-muted/40` for the card's header
              band: `--secondary` and `--muted` hold identical values in both
              themes (`oklch(0.97 0 0)` light, `oklch(0.269 0 0)` dark), so the
              band is the same colour it has always been — but `--color-muted`
              is the var-chain `var(--admin-muted, var(--landing-muted))` and
              only resolves to the shadcn value because `globals.css` pins
              `--admin-muted` on `body:has([data-onboarding-surface])`.
              `--color-secondary` reads `--secondary` directly, with no fallback
              arm that could drop this band into the landing palette. */}
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-[13px] py-[11px]">
            <h2 className="text-[12.5px] font-semibold">{card.title}</h2>
            <button
              type="button"
              onClick={() => goToStep(card.editStep)}
              className="cursor-pointer text-xs font-semibold text-onboarding-accent transition-colors hover:text-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {tShared("edit")}
              <span className="sr-only"> {card.title.toLowerCase()}</span>
            </button>
          </div>

          <dl className="px-[13px] pt-1 pb-2.5">
            {card.rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-3.5 py-1.5"
              >
                <dt className="shrink-0 text-[12.5px] text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="text-right text-[12.5px] font-medium">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <div className="mt-5 border-t border-border pt-[22px]">
        {submitError !== null ? (
          <p role="alert" className="mb-3 text-[13px] text-destructive">
            {submitError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          // `text-white` on `bg-onboarding-accent` is deliberate in both themes:
          // the brand orange is theme-independent by design, so the label on it
          // has to be too. `text-primary-foreground` would flip to near-black on
          // orange under `.dark`. Leave the pair as it is.
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </div>
  );
}
