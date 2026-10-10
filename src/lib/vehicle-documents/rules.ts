/**
 * The rules of vehicle documents — registration and insurance — with nothing
 * else attached: what may be uploaded, how a document's state is read off its
 * rows, when an expiry date is acceptable, and what a driver should be warned
 * about.
 *
 * Deliberately free of runtime imports (no `server-only`, no Prisma, no
 * Supabase, no Next), the arrangement `orders/pod-rules.ts` has, so
 * `tests/vehicle-document-rules.spec.ts` can pin every rule without a server, a
 * database or a bucket. The modules that touch Storage and the database ask
 * this one for every decision.
 *
 * ## Dates
 *
 * An expiry is a **calendar date**, carried here as `YYYY-MM-DD` and compared
 * as one. "Today" is passed in by the caller (the Tbilisi day, from
 * `hub/timezone.ts`) rather than read from a clock, which is what keeps these
 * functions pure. A document is valid *through* its expiry date: it expires at
 * the end of that day, not the start.
 */

/** The two documents a vehicle carries, in the order the app lists them. */
export type VehicleDocumentType = "REGISTRATION" | "INSURANCE";

export const VEHICLE_DOCUMENT_TYPES: readonly VehicleDocumentType[] = [
  "REGISTRATION",
  "INSURANCE",
];

/** A reviewer's verdict on one upload. */
export type VehicleDocumentReviewStatus = "PENDING" | "APPROVED" | "FLAGGED";

/**
 * How many days before its expiry a document starts to be reported as
 * `EXPIRING`. **The one statement of the threshold** — the hub's attention
 * summary, the per-vehicle document state and the admin queue all read it.
 *
 * Thirty days: the design's own warning is shown at "in 21 days", and a month
 * is the notice an insurer's renewal reminder gives.
 */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

const BYTES_PER_MB = 1024 * 1024;

/**
 * The largest file recorded — the same 10 MB a proof-of-delivery photo is held
 * to, for the same reason: room for a phone photo the app did not downscale,
 * without a signed upload URL becoming free bulk storage.
 */
export const MAX_VEHICLE_DOCUMENT_BYTES = 10 * BYTES_PER_MB;

/** `MAX_VEHICLE_DOCUMENT_BYTES` in megabytes, for messages. */
export const MAX_VEHICLE_DOCUMENT_MB =
  MAX_VEHICLE_DOCUMENT_BYTES / BYTES_PER_MB;

/**
 * What Storage may hold. JPG and PNG only, as for every other document in the
 * `driver-documents` bucket: a reviewer opens these from a signed URL, where an
 * SVG or HTML object would execute on the Storage origin.
 */
const ALLOWED_CONTENT_TYPES: readonly string[] = ["image/jpeg", "image/png"];

/** Narrows an untrusted value to a `VehicleDocumentType`. */
export function isVehicleDocumentType(
  value: unknown,
): value is VehicleDocumentType {
  return (
    typeof value === "string" &&
    VEHICLE_DOCUMENT_TYPES.includes(value as VehicleDocumentType)
  );
}

/** Whether Storage may hold an object of this content type. */
export function isAllowedVehicleDocumentContentType(
  contentType: string,
): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType);
}

/* ------------------------------------------------------------------------- */
/* Object paths                                                              */
/* ------------------------------------------------------------------------- */

/**
 * The first path segment of every vehicle document. Onboarding documents live
 * in the same bucket under `<driverProfileId>/…`; a driver-profile id is a
 * cuid, which this literal can never be, so the two families cannot collide.
 */
const PATH_ROOT = "vehicles";

/** Characters allowed in the file-name suffix of an object path. */
const UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9._-]+/g;

/** Fallback name for an uploaded file with no usable original name. */
const FALLBACK_FILE_NAME = "document";

/** Bounds the file-name suffix; the UUID before it is what makes a path unique. */
const MAX_FILE_NAME_LENGTH = 80;

/**
 * Normalises an uploaded file's name for use inside an object path: Storage
 * keys treat "/" as a folder separator, so an unsanitised name could otherwise
 * escape the vehicle's own prefix.
 */
export function toSafeVehicleDocumentFileName(fileName: string): string {
  const safe = fileName
    .trim()
    .replace(UNSAFE_FILE_NAME_CHARS, "-")
    .slice(-MAX_FILE_NAME_LENGTH);

  return safe.length > 0 && safe !== "." && safe !== ".."
    ? safe
    : FALLBACK_FILE_NAME;
}

/** The folder segment a document of this type lives under. */
function typeSegment(type: VehicleDocumentType): string {
  return type === "REGISTRATION" ? "registration" : "insurance";
}

/**
 * The object path for one upload:
 * `vehicles/<vehicleId>/<registration|insurance>/<uuid>-<name>`.
 *
 * Namespaced by vehicle so its documents stay together, by type so a path
 * issued for a registration can never be registered as the insurance, and
 * prefixed with a UUID so two uploads of `IMG_0001.jpg` never collide. The UUID
 * is passed in rather than generated here to keep this function pure.
 */
export function vehicleDocumentObjectPath(
  vehicleId: string,
  type: VehicleDocumentType,
  uuid: string,
  fileName: string,
): string {
  return `${PATH_ROOT}/${vehicleId}/${typeSegment(type)}/${uuid}-${toSafeVehicleDocumentFileName(fileName)}`;
}

/** Exactly the character set `toSafeVehicleDocumentFileName` can emit. */
const DOCUMENT_FILE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Whether `path` is one this vehicle could have been issued an upload URL for,
 * for this type.
 *
 * Without it the owner of one vehicle could register an object belonging to
 * **another** vehicle — or an onboarding document from the same bucket — as
 * their own. An allowlist of the exact shape `vehicleDocumentObjectPath` mints,
 * not a blacklist of "..", for the reason given on `isPodObjectPath`: the path
 * is interpolated into a Storage URL downstream, where "%2e%2e" resolves to a
 * dot segment just as a literal ".." does.
 */
export function isVehicleDocumentObjectPath(
  path: string,
  vehicleId: string,
  type: VehicleDocumentType,
): boolean {
  const [root, vehicle, segment, fileName, ...extra] = path.split("/");

  return (
    extra.length === 0 &&
    fileName !== undefined &&
    vehicleId !== "" &&
    root === PATH_ROOT &&
    vehicle === vehicleId &&
    segment === typeSegment(type) &&
    fileName !== "." &&
    fileName !== ".." &&
    DOCUMENT_FILE_NAME.test(fileName)
  );
}

/* ------------------------------------------------------------------------- */
/* Expiry dates                                                              */
/* ------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The UTC-midnight instant of a `YYYY-MM-DD` date, or null when the string is
 * not one or names no real day ("2026-02-30").
 */
function utcMidnightOf(date: string): Date | null {
  const match = ISO_DATE.exec(date);
  if (!match) {
    return null;
  }

  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const instant = new Date(Date.UTC(year, month - 1, day));

  // `Date.UTC` rolls an impossible day over into the next month; reading the
  // fields back is what catches it.
  return instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
    ? instant
    : null;
}

/**
 * Narrows an untrusted value to a real `YYYY-MM-DD` calendar date, or null.
 * A full ISO timestamp is refused rather than truncated: the zone it was
 * written in would silently decide which day it lands on.
 */
export function parseExpiryDate(value: unknown): string | null {
  return typeof value === "string" && utcMidnightOf(value) !== null
    ? value
    : null;
}

/**
 * The instant an expiry date is stored as — UTC midnight of that day, the
 * convention `DriverLicence.expiresAt` already follows. Throws on a string
 * `parseExpiryDate` would have refused, which is a programming error.
 */
export function expiryDateToInstant(date: string): Date {
  const instant = utcMidnightOf(date);
  if (instant === null) {
    throw new Error(`Not a calendar date: ${date}`);
  }

  return instant;
}

/** The `YYYY-MM-DD` date a stored expiry instant names. */
export function instantToExpiryDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * Whole days from `today` to `expiresAt`: 0 on the expiry day itself (the last
 * day the document is valid), negative once it has passed.
 */
export function daysUntilExpiry(expiresAt: string, today: string): number {
  return Math.round(
    (expiryDateToInstant(expiresAt).getTime() -
      expiryDateToInstant(today).getTime()) /
      MS_PER_DAY,
  );
}

/** Where an approved document stands against the calendar. */
export type DocumentValidity = "VALID" | "EXPIRING" | "EXPIRED";

/**
 * `EXPIRED` once the expiry date has passed, `EXPIRING` from
 * `DOCUMENT_EXPIRY_WARNING_DAYS` before it through the day itself, `VALID`
 * otherwise — including for a document with no expiry at all.
 */
export function validityOf(
  expiresAt: string | null,
  today: string,
): DocumentValidity {
  if (expiresAt === null) {
    return "VALID";
  }

  const days = daysUntilExpiry(expiresAt, today);

  if (days < 0) {
    return "EXPIRED";
  }

  return days <= DOCUMENT_EXPIRY_WARNING_DAYS ? "EXPIRING" : "VALID";
}

/**
 * Whether approving a document of this type needs an expiry date. An insurance
 * policy always has one; a registration certificate does not, so its date is
 * optional (a reviewer may still record one, e.g. for a temporary plate).
 */
export function isExpiryRequired(type: VehicleDocumentType): boolean {
  return type === "INSURANCE";
}

/** Why an approval's expiry date is not acceptable. */
export type ExpiryRefusal = "EXPIRY_REQUIRED" | "EXPIRY_IN_PAST";

/**
 * Judges the expiry date a reviewer approves a document with, or returns null
 * when it is acceptable.
 *
 * A date already past is refused: approving a document that has expired is
 * what flagging it as "Document expired" is for, and accepting the date would
 * put a document on file that is invalid the moment it is approved.
 */
export function expiryRefusalFor(
  type: VehicleDocumentType,
  expiresAt: string | null,
  today: string,
): ExpiryRefusal | null {
  if (expiresAt === null) {
    return isExpiryRequired(type) ? "EXPIRY_REQUIRED" : null;
  }

  return daysUntilExpiry(expiresAt, today) < 0 ? "EXPIRY_IN_PAST" : null;
}

/* ------------------------------------------------------------------------- */
/* Reading a vehicle's documents off its rows                                */
/* ------------------------------------------------------------------------- */

/** One **live** (not superseded) document row, already reduced to plain data. */
export type LiveVehicleDocument = {
  id: string;
  type: VehicleDocumentType;
  status: VehicleDocumentReviewStatus;
  /** As it should be shown — the caller localises it. */
  flagReason: string | null;
  /** `YYYY-MM-DD`, or null. */
  expiresAt: string | null;
  /** ISO timestamp of the upload. */
  uploadedAt: string;
  /** ISO timestamp of the verdict, or null while pending. */
  reviewedAt: string | null;
};

/**
 * The one word for a document, for a status pill:
 *
 * - `MISSING` — nothing has ever been accepted and nothing is awaiting review.
 * - `UNDER_REVIEW` — an upload is with the back office.
 * - `FLAGGED` — the latest upload was refused; upload again.
 * - `VALID` / `EXPIRING` / `EXPIRED` — the document on file, by the calendar.
 *
 * A submission outranks the document on file because it is the newer fact and
 * the one the driver is waiting on (or must act on); `onFile` still says
 * whether the vehicle is covered meanwhile.
 */
export type VehicleDocumentState =
  "MISSING" | "UNDER_REVIEW" | "FLAGGED" | DocumentValidity;

/** One document type for one vehicle. */
export type VehicleDocumentSlot = {
  type: VehicleDocumentType;
  state: VehicleDocumentState;
  /** The approved document on file, or null when there is none. */
  onFile: {
    id: string;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    validity: DocumentValidity;
    approvedAt: string | null;
  } | null;
  /** The upload awaiting review or refused by it, or null. */
  submission: {
    id: string;
    status: "PENDING" | "FLAGGED";
    flagReason: string | null;
    uploadedAt: string;
  } | null;
};

/**
 * A vehicle's documents, one slot per type in `VEHICLE_DOCUMENT_TYPES` order —
 * always both, so "missing" is a state the reader is handed rather than an
 * absence it has to notice.
 *
 * `liveRows` are the vehicle's rows with `supersededAt: null`. The database
 * allows at most one approved and one unapproved per type; should a bad write
 * ever leave more, the newest upload of each wins.
 */
export function summarizeVehicleDocuments(
  liveRows: readonly LiveVehicleDocument[],
  today: string,
): VehicleDocumentSlot[] {
  const newestFirst = [...liveRows].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  );

  return VEHICLE_DOCUMENT_TYPES.map((type) => {
    const rows = newestFirst.filter((row) => row.type === type);
    const approved = rows.find((row) => row.status === "APPROVED");
    const unapproved = rows.find((row) => row.status !== "APPROVED");

    const onFile =
      approved === undefined
        ? null
        : {
            id: approved.id,
            expiresAt: approved.expiresAt,
            daysUntilExpiry:
              approved.expiresAt === null
                ? null
                : daysUntilExpiry(approved.expiresAt, today),
            validity: validityOf(approved.expiresAt, today),
            approvedAt: approved.reviewedAt,
          };

    const submission =
      unapproved === undefined
        ? null
        : {
            id: unapproved.id,
            status:
              unapproved.status === "FLAGGED"
                ? ("FLAGGED" as const)
                : ("PENDING" as const),
            flagReason:
              unapproved.status === "FLAGGED" ? unapproved.flagReason : null,
            uploadedAt: unapproved.uploadedAt,
          };

    const state: VehicleDocumentState =
      submission !== null
        ? submission.status === "FLAGGED"
          ? "FLAGGED"
          : "UNDER_REVIEW"
        : onFile !== null
          ? onFile.validity
          : "MISSING";

    return { type, state, onFile, submission };
  });
}

/* ------------------------------------------------------------------------- */
/* What a driver should be told about                                        */
/* ------------------------------------------------------------------------- */

/** Which document an attention item is about. */
export type AttentionDocument =
  "DRIVING_LICENCE" | "VEHICLE_REGISTRATION" | "VEHICLE_INSURANCE";

/**
 * Why a document needs attention:
 *
 * - `FLAGGED` — the latest upload was refused. Reported first whatever is on
 *   file, because it is the one that carries an instruction (`flagReason`).
 * - `EXPIRED` — the document on file has passed its expiry date.
 * - `MISSING` — no document has ever been accepted.
 * - `EXPIRING` — the document on file expires within the warning window.
 */
export type AttentionReason = "MISSING" | "FLAGGED" | "EXPIRING" | "EXPIRED";

export type DocumentAttentionItem = {
  document: AttentionDocument;
  reason: AttentionReason;
  /** Null for the driving licence, which belongs to the driver. */
  vehicleId: string | null;
  plateNumber: string | null;
  /** The document on file's expiry, `YYYY-MM-DD`; null when none is on file. */
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  /** The reviewer's reason, when `reason` is `FLAGGED`. */
  flagReason: string | null;
  /**
   * True when a replacement is already with the back office: the driver has
   * done their part and can only wait. Never true for `FLAGGED`.
   */
  underReview: boolean;
};

const ATTENTION_DOCUMENT_BY_TYPE: Record<
  VehicleDocumentType,
  AttentionDocument
> = {
  REGISTRATION: "VEHICLE_REGISTRATION",
  INSURANCE: "VEHICLE_INSURANCE",
};

/**
 * The attention item for one document slot, or null when it needs none — a
 * valid document on file, with or without a renewal under review.
 */
export function attentionForSlot(
  slot: VehicleDocumentSlot,
  vehicle: { id: string; plateNumber: string },
): DocumentAttentionItem | null {
  const { onFile, submission } = slot;

  const reason: AttentionReason | null =
    submission?.status === "FLAGGED"
      ? "FLAGGED"
      : onFile === null
        ? "MISSING"
        : onFile.validity === "VALID"
          ? null
          : onFile.validity;

  if (reason === null) {
    return null;
  }

  return {
    document: ATTENTION_DOCUMENT_BY_TYPE[slot.type],
    reason,
    vehicleId: vehicle.id,
    plateNumber: vehicle.plateNumber,
    expiresAt: onFile?.expiresAt ?? null,
    daysUntilExpiry: onFile?.daysUntilExpiry ?? null,
    flagReason: reason === "FLAGGED" ? (submission?.flagReason ?? null) : null,
    underReview: submission?.status === "PENDING",
  };
}

/**
 * The attention item for the driving licence, or null.
 *
 * Only ever `EXPIRING` or `EXPIRED`: a licence has no renewal flow yet, and a
 * driver with no licence row (one a company registered onto its roster) was
 * never asked for one, so its absence is not reported as `MISSING`.
 */
export function attentionForLicence(
  expiresAt: string | null,
  today: string,
): DocumentAttentionItem | null {
  if (expiresAt === null) {
    return null;
  }

  const validity = validityOf(expiresAt, today);
  if (validity === "VALID") {
    return null;
  }

  return {
    document: "DRIVING_LICENCE",
    reason: validity,
    vehicleId: null,
    plateNumber: null,
    expiresAt,
    daysUntilExpiry: daysUntilExpiry(expiresAt, today),
    flagReason: null,
    underReview: false,
  };
}

/** Most urgent first. */
const REASON_RANK: Record<AttentionReason, number> = {
  EXPIRED: 0,
  MISSING: 1,
  FLAGGED: 2,
  EXPIRING: 3,
};

/** The "documents needing attention" summary on `GET /api/dashboard/hub/me`. */
export type DocumentAttentionSummary = {
  /** `DOCUMENT_EXPIRY_WARNING_DAYS`, so the reader need not hard-code it. */
  expiryWarningDays: number;
  /** Items the driver can act on now: those not `underReview`. */
  actionRequiredCount: number;
  /** Most urgent first; empty when everything is in order. */
  items: DocumentAttentionItem[];
};

/**
 * Orders the items — expired, then missing, then flagged, then expiring, and
 * the soonest expiry first within a reason — and counts the actionable ones.
 */
export function toAttentionSummary(
  items: readonly DocumentAttentionItem[],
): DocumentAttentionSummary {
  const sorted = [...items].sort(
    (a, b) =>
      REASON_RANK[a.reason] - REASON_RANK[b.reason] ||
      (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0),
  );

  return {
    expiryWarningDays: DOCUMENT_EXPIRY_WARNING_DAYS,
    actionRequiredCount: sorted.filter((item) => !item.underReview).length,
    items: sorted,
  };
}
