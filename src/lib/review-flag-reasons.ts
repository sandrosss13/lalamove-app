import type { Translator } from "@/i18n/translator";

/**
 * The closed lists of reasons a reviewer can flag an application item with,
 * and their display in the reader's language.
 *
 * The English text is the *stored value*: a chip click sends it verbatim, the
 * review routes (`src/app/api/admin/business-applications/[id]/company` and
 * `…/vehicles/[vehicleId]`) import these same lists to validate it, and it
 * lands in the `flagReason` column. The company and vehicle lists are closed on the server
 * (the driver-document endpoint accepts any non-empty string) because the
 * applicant's status screen keys its corrective copy off the reason, so a
 * free-typed one would leave nothing actionable. Only the *rendering* is translated, through
 * `flagReasonLabel`, so a reason flagged by an English-speaking reviewer still
 * reads in Georgian on the applicant's status screen, and vice versa.
 */

/** The four company-level flag reasons from the design. */
export const COMPANY_FLAG_REASONS: readonly string[] = [
  "VAT ID not found in the registry",
  "Address does not match registration",
  "Bank account not held by the entity",
  "Contact person unreachable",
];

/** The six per-vehicle flag reasons from the design. */
export const VEHICLE_FLAG_REASONS: readonly string[] = [
  "Plate does not match the documents",
  "Payload above the class limit",
  "Dimensions look wrong",
  "Vehicle too old for the platform",
  "Duplicate plate on another fleet",
  "Cooling unit record missing",
];

/** The six per-document flag reasons for a driver application. */
export const DOCUMENT_FLAG_REASONS: readonly string[] = [
  "Photo is blurry",
  "Glare — details unreadable",
  "Face not clearly visible",
  "Wrong document uploaded",
  "Document expired",
  "Does not match the ID",
];

/**
 * The reasons offered for a vehicle document (registration, insurance) —
 * every one already in the lists above, so each already has its translation.
 * The server accepts any non-empty reason here too, as it does for a driver's
 * onboarding documents; a typed one is shown to the driver as written.
 */
export const VEHICLE_DOCUMENT_FLAG_REASONS: readonly string[] = [
  "Photo is blurry",
  "Glare — details unreadable",
  "Wrong document uploaded",
  "Document expired",
  "Plate does not match the documents",
];

/** Stored reason → message path. */
const FLAG_REASON_KEY: Readonly<Record<string, string>> = {
  "VAT ID not found in the registry": "admin.flagReasons.vatIdNotFound",
  "Address does not match registration":
    "admin.flagReasons.addressDoesNotMatch",
  "Bank account not held by the entity":
    "admin.flagReasons.bankAccountNotHeldByEntity",
  "Contact person unreachable": "admin.flagReasons.contactPersonUnreachable",
  "Plate does not match the documents": "admin.flagReasons.plateDoesNotMatch",
  "Payload above the class limit": "admin.flagReasons.payloadAboveClassLimit",
  "Dimensions look wrong": "admin.flagReasons.dimensionsLookWrong",
  "Vehicle too old for the platform": "admin.flagReasons.vehicleTooOld",
  "Duplicate plate on another fleet": "admin.flagReasons.duplicatePlate",
  "Cooling unit record missing": "admin.flagReasons.coolingUnitRecordMissing",
  "Photo is blurry": "admin.flagReasons.photoIsBlurry",
  "Glare — details unreadable": "admin.flagReasons.glareDetailsUnreadable",
  "Face not clearly visible": "admin.flagReasons.faceNotClearlyVisible",
  "Wrong document uploaded": "admin.flagReasons.wrongDocumentUploaded",
  "Document expired": "admin.flagReasons.documentExpired",
  "Does not match the ID": "admin.flagReasons.doesNotMatchTheId",
};

/**
 * A stored flag reason in the reader's language. A reason outside the known
 * lists — one written before the lists were closed, or a future one this build
 * does not know — is shown as stored rather than hidden: the applicant needs
 * to see *something* actionable.
 */
export function flagReasonLabel(reason: string, t: Translator): string {
  const key = Object.hasOwn(FLAG_REASON_KEY, reason)
    ? FLAG_REASON_KEY[reason]
    : undefined;

  return key ? t(key) : reason;
}
