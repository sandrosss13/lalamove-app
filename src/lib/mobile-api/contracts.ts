/**
 * The wire contract between this backend and the native driver app: one plain
 * TypeScript type per JSON response a driver client reads.
 *
 * **This file is copied into the mobile repository verbatim, so it imports
 * nothing** — no Prisma, no Next, no `next-intl`, no `server-only`, no `@/`
 * alias. Every enum is spelled as a string-literal union rather than imported
 * from `@prisma/client`; the route handlers assign Prisma's own values to these
 * types, so a member added to the schema fails this repo's typecheck until it
 * is added here (and the copy in the app is refreshed).
 *
 * | Route                               | 200 body                 |
 * | ----------------------------------- | ------------------------ |
 * | `GET /api/loads`                    | `LoadBoardResponse`      |
 * | `GET /api/dashboard/hub/me`         | `HubMeResponse`          |
 * | `GET /api/dashboard/hub/jobs`       | `HubJobsResponse`        |
 * | `GET /api/dashboard/hub/jobs/[id]`  | `HubJobSheetResponse`    |
 * | `GET /api/dashboard/hub/vehicles`   | `HubVehiclesResponse`    |
 * | `GET /api/dashboard/hub/account`    | `HubAccountResponse`     |
 *
 * Failures: `GET /api/loads` answers `LoadBoardError`; every
 * `/api/dashboard/hub/*` route above answers `HubApiErrorResponse`.
 *
 * Running a job, and its proof of delivery (success status in brackets where
 * it is not 200):
 *
 * | Route                                            | Request body               | Success body               |
 * | ------------------------------------------------ | -------------------------- | -------------------------- |
 * | `POST /api/orders/[id]/accept`                   | `{ vehicleId }`            | the order (carrier fields) |
 * | `POST /api/orders/[id]/start`                    | none                       | the order (carrier fields) |
 * | `POST /api/orders/[id]/pod/upload-url`           | `PodUploadUrlRequest`      | `PodUploadUrlResponse`     |
 * | `POST /api/orders/[id]/pod`                      | `PodRegisterRequest`       | `OrderProofOfDelivery`     |
 * | `DELETE /api/orders/[id]/pod/photos/[photoId]`   | none                       | `OrderProofOfDelivery`     |
 * | `POST /api/orders/[id]/complete`                 | `OrderCompleteRequest`     | the order (carrier fields) |
 *
 * Failures of `start`, `complete` and the three `pod` routes answer
 * `OrderActionErrorResponse`. `accept` answers `{ error }`, with a `code` only
 * for `PASSWORD_CHANGE_REQUIRED`.
 *
 * Vehicle documents (registration, insurance) and support messages (success
 * status in brackets where it is not 200):
 *
 * | Route                                                       | Request body                      | Success body                        |
 * | ----------------------------------------------------------- | --------------------------------- | ----------------------------------- |
 * | `GET /api/driver-profile/vehicles/[id]/documents`           | —                                 | `VehicleDocumentsResponse`          |
 * | `POST /api/driver-profile/vehicles/[id]/documents/upload-url` | `VehicleDocumentUploadUrlRequest` | `VehicleDocumentUploadUrlResponse`  |
 * | `POST /api/driver-profile/vehicles/[id]/documents`          | `VehicleDocumentRegisterRequest`  | `VehicleDocumentsResponse`          |
 * | `GET /api/dashboard/hub/support/messages`                   | —                                 | `SupportMessagesResponse`           |
 * | `POST /api/dashboard/hub/support/messages`                  | `SupportMessageCreateRequest`     | `SupportMessageCreateResponse` (201) |
 *
 * Failures: `VehicleDocumentErrorResponse` and `SupportMessageErrorResponse`.
 *
 * Pushed load offers, and the device tokens their notifications go to:
 *
 * | Route                                          | Request body                 | Success body                 |
 * | ---------------------------------------------- | ---------------------------- | ---------------------------- |
 * | `GET /api/dashboard/hub/offers/current`        | —                            | `HubCurrentOfferResponse`    |
 * | `GET /api/dashboard/hub/offers/[id]`           | —                            | `HubOfferStateResponse`      |
 * | `POST /api/dashboard/hub/offers/[id]/accept`   | `HubOfferAcceptRequest`      | `HubOfferAcceptResponse`     |
 * | `POST /api/dashboard/hub/offers/[id]/decline`  | none                         | `HubOfferStateResponse`      |
 * | `POST /api/dashboard/hub/push-tokens`          | `PushTokenRegisterRequest`   | `PushTokenRegisterResponse`  |
 * | `DELETE /api/dashboard/hub/push-tokens`        | `PushTokenUnregisterRequest` | `PushTokenUnregisterResponse` |
 *
 * Failures: `HubOfferErrorResponse` and `PushTokenErrorResponse`.
 *
 * A driver's own settings (success status in brackets where it is not 200):
 *
 * | Route                                              | Request body                       | Success body                          |
 * | -------------------------------------------------- | ---------------------------------- | ------------------------------------- |
 * | `PATCH /api/dashboard/hub/account/profile`         | `HubDriverProfileUpdateRequest`    | `HubAccountDriverSettings`            |
 * | `GET /api/dashboard/hub/notification-settings`     | —                                  | `HubNotificationSettingsResponse`     |
 * | `PATCH /api/dashboard/hub/notification-settings`   | `HubNotificationSettingsUpdateRequest` | `HubNotificationSettingsResponse` |
 * | `GET /api/dashboard/hub/route-alerts`              | —                                  | `HubRouteAlertsResponse`              |
 * | `POST /api/dashboard/hub/route-alerts`             | `HubRouteAlertCreateRequest`       | `HubRouteAlertResponse` (201)         |
 * | `PATCH /api/dashboard/hub/route-alerts/[id]`       | `HubRouteAlertUpdateRequest`       | `HubRouteAlertResponse`               |
 * | `DELETE /api/dashboard/hub/route-alerts/[id]`      | none                               | `HubRouteAlertDeleteResponse`         |
 * | `GET /api/dashboard/hub/work-preferences`          | —                                  | `HubWorkPreferencesResponse`          |
 * | `PATCH /api/dashboard/hub/work-preferences`        | `HubWorkPreferencesUpdateRequest`  | `HubWorkPreferencesResponse`          |
 *
 * Failures: `HubSettingsErrorResponse`. All of them are driver-only — a
 * logistics company is answered 403 `ROLE_NOT_ALLOWED`.
 *
 * Driver onboarding (success status in brackets where it is not 200):
 *
 * | Route                                                      | Request body                 | Success body                       |
 * | ---------------------------------------------------------- | ---------------------------- | ---------------------------------- |
 * | `GET /api/driver-profile`                                  | —                            | `DriverProfileGetResponse`         |
 * | `POST /api/driver-profile`                                 | `DriverProfileUpsertRequest` | `DriverProfileUpsertResponse` (201) |
 * | `PATCH /api/driver-profile/status`                         | `DriverStatusUpdateRequest`  | `DriverStatusUpdateResponse`       |
 * | `GET /api/driver-profile/onboarding`                       | —                            | `OnboardingGetResponse`            |
 * | `PATCH /api/driver-profile/onboarding`                     | `OnboardingSaveDraftRequest` | none (204)                         |
 * | `POST /api/driver-profile/onboarding/submit`               | none (ignored)               | `OnboardingSubmitResponse`         |
 * | `POST /api/driver-profile/onboarding/reset`                | —                            | none (204)                         |
 * | `POST /api/driver-profile/onboarding/documents/upload-url` | `OnboardingUploadUrlRequest` | `OnboardingUploadUrlResponse`      |
 * | `POST /api/driver-profile/onboarding/documents`            | `OnboardingDocumentRequest`  | `OnboardingDocumentResponse`       |
 * | `GET /api/vehicle-types`                                   | —                            | `VehicleTypesResponse`             |
 *
 * Failures: every `/api/driver-profile/*` route answers `DriverApiError`,
 * which carries no machine code.
 *
 * Phone sign-in: `POST /api/auth/phone-number/send-otp` (`PhoneSendOtpRequest`
 * → `PhoneSendOtpResponse`) and `POST /api/auth/phone-number/verify`
 * (`PhoneVerifyRequest` → `PhoneVerifyResponse`); both fail with
 * `PhoneAuthErrorResponse`.
 *
 * Conventions shared by every type here:
 *
 * - Timestamps are ISO-8601 strings, never `Date` — this is what `JSON.parse`
 *   hands the client.
 * - Money is GEL in major units (`142.6` = ₾142.60) and is always the
 *   **carrier's** side: `driverPayout`, `overtimeDriverPayout` and figures
 *   derived from them. What the client paid (`price`, `baseFare`,
 *   `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`,
 *   `serviceLevelAdjustment`) and `commissionRate` appear nowhere in this file
 *   and must never be added — see `tests/carrier-payload-redaction.spec.ts`.
 * - Nothing here is placeholder data. The web hub decorates several screens
 *   with clearly-labelled sample figures (its `sampled` sub-objects); the JSON
 *   routes strip all of them, so there is no `sampled` key on any type below.
 */

/* ------------------------------------------------------------------------- */
/* Errors                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Why a `/api/dashboard/hub/*` request was refused, for the client to branch on
 * without matching on the localised `error` prose.
 *
 * - `UNAUTHENTICATED` (401) — no session, an expired one, or a suspended
 *   account (whose session is destroyed server-side). Sign in again.
 * - `PASSWORD_CHANGE_REQUIRED` (403) — the account still holds the temporary
 *   password a company issued it. Send the user to the change-password flow.
 * - `ROLE_NOT_ALLOWED` (403) — signed in, but not as a driver or a logistics
 *   company.
 * - `PROFILE_MISSING` (403) — the driver/company profile row does not exist
 *   yet (interrupted sign-up).
 * - `NOT_FOUND` (404) — the job does not exist **or is not this account's**;
 *   the two are deliberately indistinguishable.
 */
export type HubApiErrorCode =
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "ROLE_NOT_ALLOWED"
  | "PROFILE_MISSING"
  | "NOT_FOUND";

/** The body of every non-200 answer from a `/api/dashboard/hub/*` read route. */
export type HubApiErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: HubApiErrorCode;
};

/* ------------------------------------------------------------------------- */
/* Shared vocabulary                                                         */
/* ------------------------------------------------------------------------- */

/** Which hub shell the account gets: a fleet owner, or one person driving. */
export type HubAccountKind = "BUSINESS" | "INDIVIDUAL";

/**
 * The finer axis: `INDEPENDENT` owns their own work, `ROSTER` drives for a
 * company, `BUSINESS` is the company itself.
 */
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";

/** The raw order lifecycle, as stored. `INITIATED` never reaches a carrier. */
export type HubOrderStatus =
  | "INITIATED"
  | "PENDING"
  | "CLAIMED"
  | "ACCEPTED"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "CANCELLED";

/* ------------------------------------------------------------------------- */
/* GET /api/dashboard/hub/me                                                 */
/* ------------------------------------------------------------------------- */

/** Who is signed in, in the shape the hub shell renders from. */
export type HubMeAccount = {
  kind: HubAccountKind;
  persona: HubPersona;
  userId: string;
  /** The person's name, or the company's for a `BUSINESS` account. */
  displayName: string;
  /** One or two upper-case letters for an avatar. */
  initials: string;
  /** "Cargo Van · Tbilisi" for a driver; the VAT id for a company. */
  identifier: string;
  city: string;
  /** Null for a `BUSINESS` account, which has no online state of its own. */
  isOnline: boolean | null;
  /** False until the back office has approved the account. */
  isActivated: boolean;
  canToggleOnline: boolean;
  /** The employer for a `ROSTER` driver, the company itself for `BUSINESS`. */
  companyName: string | null;
  driverProfileId: string | null;
  companyId: string | null;
};

/** One job currently under way, for the header's "in progress" pill. */
export type HubMeJobInProgress = {
  id: string;
  /** The order's human reference. */
  shortId: string;
  /** "<pickup address> → <dropoff address>". */
  route: string;
  /**
   * Who is driving it — for a `BUSINESS` account only, and null there while
   * the job is claimed but not yet dispatched to a person ("Unassigned").
   * Always null for a driver, who is reading their own job.
   */
  driverName: string | null;
  /**
   * When the load must arrive by, or null when the order names no deadline.
   * The app derives its own countdown ("42 min", "Overdue") from this, in the
   * reader's language and ticking — the web's ready-made English label is not
   * sent.
   */
  deliveryDeadline: string | null;
};

export type HubMeResponse = {
  account: HubMeAccount;
  /** How many of this account's orders are `ACCEPTED` or `IN_TRANSIT`. */
  jobsInProgressCount: number;
  /** A preview: at most 1 for a driver, at most 3 for a company. */
  jobsInProgress: HubMeJobInProgress[];
  /**
   * The driver-support line to dial, exactly as the server is configured with
   * it (`DRIVER_SUPPORT_PHONE`), or **null when none is configured** — hide the
   * call button then; there is no default number.
   */
  supportPhone: string | null;
  /**
   * The documents this driver should be told about: missing, flagged, expiring
   * or expired. `items` is empty when everything is in order, and always empty
   * for a `BUSINESS` account. See `HubDocumentsAttention`.
   */
  documentsAttention: HubDocumentsAttention;
};

/** Which document an attention item is about. */
export type HubAttentionDocument =
  "DRIVING_LICENCE" | "VEHICLE_REGISTRATION" | "VEHICLE_INSURANCE";

/**
 * Why a document needs attention:
 *
 * - `FLAGGED` — the latest upload was refused; `flagReason` says why. Upload
 *   again. Reported whatever is on file.
 * - `EXPIRED` — the document on file has passed its expiry date.
 * - `MISSING` — no document has ever been accepted. The ordinary starting
 *   state: onboarding collects neither vehicle document.
 * - `EXPIRING` — the document on file expires within `expiryWarningDays`.
 *
 * The driving licence is only ever `EXPIRING` or `EXPIRED`.
 */
export type HubAttentionReason = "MISSING" | "FLAGGED" | "EXPIRING" | "EXPIRED";

export type HubDocumentAttentionItem = {
  document: HubAttentionDocument;
  reason: HubAttentionReason;
  /** The vehicle the document belongs to; null for the driving licence. */
  vehicleId: string | null;
  plateNumber: string | null;
  /** The expiry of the document on file, `YYYY-MM-DD`; null when none is. */
  expiresAt: string | null;
  /**
   * Whole days until `expiresAt`, counted in Tbilisi days: 0 on the last valid
   * day, negative once expired. Null when `expiresAt` is.
   */
  daysUntilExpiry: number | null;
  /** The reviewer's reason, localised, when `reason` is `FLAGGED`. */
  flagReason: string | null;
  /**
   * True when a replacement is already uploaded and awaiting review — nothing
   * for the driver to do. The design hides its Home warning in this state.
   */
  underReview: boolean;
};

/**
 * The compact "documents needing attention" summary.
 *
 * Covers the driver's own licence and the registration and insurance of every
 * vehicle the driver **owns**. A `ROSTER` driver's company vehicle is not
 * covered — its documents are the company's, and the driver could not act on
 * them — so a roster driver only ever sees the licence here.
 *
 * **Informational.** Nothing on the server refuses a driver for a missing or
 * expired document; do not tell the driver that it does.
 */
export type HubDocumentsAttention = {
  /** How many days before expiry `EXPIRING` starts. Currently 30. */
  expiryWarningDays: number;
  /** The items the driver can act on now — those not `underReview`. */
  actionRequiredCount: number;
  /** Most urgent first: expired, missing, flagged, expiring. */
  items: HubDocumentAttentionItem[];
};

/* ------------------------------------------------------------------------- */
/* GET /api/dashboard/hub/jobs                                               */
/* ------------------------------------------------------------------------- */

/** The job history's four display statuses (not the raw `HubOrderStatus`). */
export type HubJobStatus =
  "In transit" | "Scheduled" | "Completed" | "Cancelled";

export type HubJobServiceLevel = "Priority" | "Regular" | "Pooling";

export type HubJobBodyType = "Dry box" | "Refrigerated" | "Open chassis";

/** A named person at a stop. Each part is null when the client left it out. */
export type HubJobStopContact = {
  name: string | null;
  phone: string | null;
  details: string | null;
};

export type HubJobsItem = {
  id: string;
  /** The last six characters of `id`, upper-cased. Prefer `reference`. */
  shortId: string;
  /** The order's human reference ("GE-48210") — what the job sheet shows. */
  reference: string;
  status: HubJobStatus;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  /** `driverPayout + overtimeDriverPayout` — the carrier's total for the job. */
  fare: number;
  driverPayout: number;
  overtimeDriverPayout: number;
  helperCount: number;
  waitingMinutes: number | null;
  createdAt: string;
  scheduledAt: string | null;
  /**
   * When the client releases the load and when it must arrive — what the
   * Orders calendar is drawn from. Each is null on a booking that gave none;
   * fall back to `scheduledAt` for the day.
   */
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  /**
   * The city at each end as a display label ("Tbilisi"), for searching the
   * history. Null when the address resolved to no listed city.
   */
  pickupCity: string | null;
  dropoffCity: string | null;
  inTransitAt: string | null;
  completedAt: string | null;
  vehicleTypeLabel: string;
  vehiclePlate: string | null;
  serviceLevel: HubJobServiceLevel;
  bodyType: HubJobBodyType | null;
  /** Null when the client gave no contact at all for the stop. */
  pickupContact: HubJobStopContact | null;
  dropoffContact: HubJobStopContact | null;
  /** A business client's own PO number / cost-centre code, if they gave one. */
  purchaseOrderRef: string | null;
};

export type HubJobCounts = {
  all: number;
  /** "In transit" plus "Scheduled". */
  active: number;
  completed: number;
  cancelled: number;
};

export type HubJobsResponse = {
  /** Every job this account holds or held, newest first. */
  jobs: HubJobsItem[];
  counts: HubJobCounts;
};

/* ------------------------------------------------------------------------- */
/* GET /api/dashboard/hub/jobs/[id]                                          */
/* ------------------------------------------------------------------------- */

/**
 * One job in full. Only ever returned to the account that holds it: the driver
 * named on the order, or the company the order belongs to.
 */
export type HubJobSheetResponse = {
  id: string;
  reference: string;
  status: HubOrderStatus;
  /** Who is driving it, on what — for a `BUSINESS` reader only; else null. */
  fleet: { driverName: string | null; vehiclePlate: string | null } | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  pickupCity: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactDetails: string | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  dropoffCity: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  distanceKm: number;
  cargoCategory: string;
  description: string | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  handlingTags: string[]; // CargoHandlingTag[]
  helperCount: number;
  bodyType: string | null; // ChassisType
  createdAt: string;
  scheduledAt: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  inTransitAt: string | null;
  completedAt: string | null;
  /**
   * Null when `status` is `CANCELLED`, and only then: a cancelled job is not
   * going to pay what it was commissioned at, so no payout figure is sent and
   * none may be shown. The web job sheet applies the same rule.
   */
  driverPayout: number | null;
  /** Null when `status` is `CANCELLED` — see `driverPayout`. */
  overtimeDriverPayout: number | null;
  waitingMinutes: number | null;
  /** Who signed for the delivery, once completed. */
  receivedBy: string | null;
  /**
   * The delivery's proof — photos and signature — as short-lived signed read
   * URLs. **Sent to the assigned driver only**; null for a `BUSINESS` reader.
   * Present (possibly empty) from the moment the job exists, so a draft in
   * progress during `IN_TRANSIT` can be restored from it.
   */
  proofOfDelivery: OrderProofOfDelivery | null;
};

/* ------------------------------------------------------------------------- */
/* Running a job — errors                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Why `start`, `complete` or a `pod` route refused, for the client to branch on
 * without matching the localised `error` prose.
 *
 * - `UNAUTHENTICATED` (401) — no session. Sign in again.
 * - `PASSWORD_CHANGE_REQUIRED` (403) — the account still holds a temporary
 *   password. Also answered, with this code, by `accept`,
 *   `GET /api/orders/[id]/location`, `POST /api/driver-profile/location` and
 *   `PATCH /api/driver-profile/status`.
 * - `NOT_FOUND` (404) — no such order (or, on delete, no such photo on it).
 * - `NOT_ASSIGNED` (403) — the order is not assigned to this driver.
 * - `INVALID_STATE` (409) — the order is not in the status the action needs:
 *   `ACCEPTED` for `start`; `IN_TRANSIT` for `complete` and every `pod` route.
 *   Re-read the job sheet.
 * - `INVALID_REQUEST` (400) — malformed body or field.
 * - `UNSUPPORTED_CONTENT_TYPE` (400) — not JPEG/PNG for a photo, not PNG for
 *   the signature. On register it is judged by what Storage recorded for the
 *   upload, and the object has been deleted.
 * - `FILE_TOO_LARGE` (400) — register only: over 10 MB for a photo or 1 MB for
 *   the signature, by the size Storage recorded. The object has been deleted.
 * - `UPLOAD_NOT_FOUND` (400) — register only: nothing was uploaded to `path`,
 *   or it could not be verified. Upload, then register again.
 * - `POD_PHOTO_LIMIT` (409) — three photos are already registered. Delete one,
 *   or register with `replacesPhotoId`.
 * - `POD_PHOTO_REQUIRED` (409) — `complete` only: no photo is registered.
 * - `POD_SIGNATURE_REQUIRED` (409) — `complete` only: at least one photo is
 *   registered but no signature. (With neither, `POD_PHOTO_REQUIRED` is sent.)
 * - `STORAGE_UNAVAILABLE` (502) — Storage could not issue the upload URL.
 * - `SERVER_ERROR` (500) — the order's vehicle type has no pricing rule.
 */
export type OrderActionErrorCode =
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "NOT_FOUND"
  | "NOT_ASSIGNED"
  | "INVALID_STATE"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "FILE_TOO_LARGE"
  | "UPLOAD_NOT_FOUND"
  /**
   * 429 from `POST /api/orders/[id]/pod/upload-url` only: too many upload URLs
   * were issued for this order and never registered. The response carries a
   * `Retry-After` header (seconds). An app that registers each upload — or
   * abandons at most a handful — never sees it.
   */
  | "TOO_MANY_PENDING_UPLOADS"
  | "POD_PHOTO_LIMIT"
  | "POD_PHOTO_REQUIRED"
  | "POD_SIGNATURE_REQUIRED"
  | "STORAGE_UNAVAILABLE"
  | "SERVER_ERROR";

export type OrderActionErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: OrderActionErrorCode;
};

/* ------------------------------------------------------------------------- */
/* Proof of delivery — /api/orders/[id]/pod                                  */
/* ------------------------------------------------------------------------- */

/** A photo of the delivered load, or the recipient's signature. */
export type PodKind = "PHOTO" | "SIGNATURE";

/** One registered proof-of-delivery photo. */
export type PodPhoto = {
  /** The handle for `DELETE …/pod/photos/[photoId]` and `replacesPhotoId`. */
  id: string;
  /** A read URL valid for 5 minutes; null when signing failed. Never cache. */
  url: string | null;
  takenAt: string;
};

/** Everything registered as proof for one order, oldest photo first. */
export type OrderProofOfDelivery = {
  /** 0–3 while `IN_TRANSIT`; 1–3 on a job completed from the app. */
  photos: PodPhoto[];
  /**
   * Whether a signature is registered. Read this, not `signatureUrl`, to decide
   * whether "Confirm delivery" may be enabled: the URL is also null when
   * signing failed.
   */
  hasSignature: boolean;
  /** A read URL (PNG) valid for 5 minutes; null when absent or unsignable. */
  signatureUrl: string | null;
};

/**
 * `POST /api/orders/[id]/pod/upload-url` body. Step 1 of 3 for each image.
 *
 * Only the assigned driver, only while the order is `IN_TRANSIT`.
 */
export type PodUploadUrlRequest = {
  kind: PodKind;
  fileName: string;
  /** `image/jpeg` or `image/png` for a `PHOTO`; `image/png` for a `SIGNATURE`. */
  contentType: string;
};

/**
 * `POST /api/orders/[id]/pod/upload-url` — 200. Upload the bytes straight to
 * Supabase Storage (bucket `delivery-proofs`) with `path` and `token` — or PUT
 * them to `signedUrl` — **sending the same `Content-Type`**, then record `path`
 * with `PodRegisterRequest`. Nothing is recorded until then.
 *
 * Errors (`OrderActionErrorResponse`): `UNAUTHENTICATED`,
 * `PASSWORD_CHANGE_REQUIRED`, `NOT_FOUND`, `NOT_ASSIGNED`, `INVALID_STATE`,
 * `INVALID_REQUEST`, `UNSUPPORTED_CONTENT_TYPE`, `STORAGE_UNAVAILABLE`.
 */
export type PodUploadUrlResponse = {
  path: string;
  signedUrl: string;
  token: string;
};

/**
 * `POST /api/orders/[id]/pod` body: record an image already uploaded to `path`.
 *
 * `path` must be one this server issued for this order through
 * `…/pod/upload-url` **within the last two hours** (the life of the signed
 * URL) and not registered before; anything else is 400 `UPLOAD_NOT_FOUND`,
 * the same answer as an upload that never arrived — start the upload again.
 * Re-sending a path that is already registered still succeeds (idempotent).
 *
 * - `PHOTO` adds a photo, up to three. `takenAt` is the capture time as an
 *   ISO-8601 string. It is recorded only when it lies between the moment the
 *   job was started and now (five minutes of clock skew allowed at each end);
 *   omitted, or outside that window, **the server's clock is recorded instead
 *   and the request still succeeds** — read the value back from the response
 *   rather than assuming the one sent. Only a value that is not an ISO
 *   date-time at all is `INVALID_REQUEST`. `replacesPhotoId` swaps the new
 *   photo in for an existing one atomically (so a retake at three photos needs
 *   no delete first); an id that is not on this order is `NOT_FOUND`.
 * - `SIGNATURE` sets the signature, replacing any earlier one.
 */
export type PodRegisterRequest =
  | { kind: "PHOTO"; path: string; takenAt?: string; replacesPhotoId?: string }
  | { kind: "SIGNATURE"; path: string };

/**
 * `POST /api/orders/[id]/pod` — 200, the order's whole proof after the write.
 *
 * Errors (`OrderActionErrorResponse`): `UNAUTHENTICATED`,
 * `PASSWORD_CHANGE_REQUIRED`, `NOT_FOUND`, `NOT_ASSIGNED`, `INVALID_STATE`,
 * `INVALID_REQUEST` (including a `path` not issued for this order and kind, or
 * one already registered), `UPLOAD_NOT_FOUND`, `UNSUPPORTED_CONTENT_TYPE`,
 * `FILE_TOO_LARGE`, `POD_PHOTO_LIMIT`.
 */
export type PodRegisterResponse = OrderProofOfDelivery;

/**
 * `DELETE /api/orders/[id]/pod/photos/[photoId]` — 200, the order's proof
 * after the delete. Only while `IN_TRANSIT`: proof is frozen at completion.
 *
 * Errors (`OrderActionErrorResponse`): `UNAUTHENTICATED`,
 * `PASSWORD_CHANGE_REQUIRED`, `NOT_FOUND`, `NOT_ASSIGNED`, `INVALID_STATE`.
 */
export type PodPhotoDeleteResponse = OrderProofOfDelivery;

/* ------------------------------------------------------------------------- */
/* POST /api/orders/[id]/complete                                            */
/* ------------------------------------------------------------------------- */

/**
 * `POST /api/orders/[id]/complete` body. `IN_TRANSIT` → `COMPLETED`.
 *
 * **Proof of delivery is required**: 1–3 registered photos and a signature,
 * else 409 `POD_PHOTO_REQUIRED` / `POD_SIGNATURE_REQUIRED`. (The web hub, which
 * has no capture screen, is exempted by a request header the app must not
 * send.)
 *
 * Overtime is computed server-side from `waitingMinutes`; the driver's share
 * is `overtimeDriverPayout` on the job sheet afterwards. The free allowance and
 * the per-minute rate are not on the wire.
 *
 * Errors (`OrderActionErrorResponse`): `UNAUTHENTICATED`,
 * `PASSWORD_CHANGE_REQUIRED`, `INVALID_REQUEST`, `NOT_FOUND`, `NOT_ASSIGNED`,
 * `INVALID_STATE`, `POD_PHOTO_REQUIRED`, `POD_SIGNATURE_REQUIRED`,
 * `SERVER_ERROR`.
 */
export type OrderCompleteRequest = {
  /** Whole minutes spent loading and unloading, 0 or more. Required. */
  waitingMinutes: number;
  /** Who took delivery. Optional; trimmed; 200 characters at most. */
  receivedBy?: string | null;
};

/* ------------------------------------------------------------------------- */
/* GET /api/dashboard/hub/vehicles                                           */
/* ------------------------------------------------------------------------- */

export type HubVehicleClass =
  | "SMALL_VAN"
  | "LARGE_VAN"
  | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK"
  | "TRAILER_TRUCK";

export type HubVehicleCategory = "MEDIUM_DUTY" | "HEAVY_DUTY";

export type HubLoadingAccessType =
  "REAR_DOOR" | "SIDE_DOOR" | "RAMP" | "TAIL_LIFT" | "OPEN_FLATBED";

/** The back office's verdict on a fleet vehicle. */
export type HubVehicleReviewStatus = "PENDING" | "APPROVED" | "FLAGGED";

/** The driver currently holding a vehicle. */
export type HubVehicleAssignment = {
  driverProfileId: string;
  driverUserId: string;
  driverName: string;
  isOnline: boolean;
  assignedAt: string;
};

export type HubVehiclesItem = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  colour: string | null;
  photoUrls: string[];
  /** The class declared at onboarding; null for older vehicles. */
  vehicleClass: HubVehicleClass | null;
  /** Localised. The declared class's name, else the type label below. */
  vehicleClassLabel: string;
  vehicleTypeSpecId: string;
  vehicleTypeCode: string;
  /** Localised. */
  vehicleTypeLabel: string;
  category: HubVehicleCategory;
  /** The class's catalogue payload. */
  maxPayloadKg: number;
  /** What the owner declared for this vehicle, when they did. */
  declaredPayloadKg: number | null;
  /** The cargo body declared for this vehicle; null for older vehicles. */
  chassisType: DriverChassisType | null;
  /** The class's catalogue cargo hold, in metres. */
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  /**
   * The hold the owner declared for this vehicle, in metres — each null when
   * it was never collected (older and most company-registered vehicles). Show
   * these when present, else the catalogue figures above.
   */
  declaredCargoLengthM: number | null;
  declaredCargoWidthM: number | null;
  declaredCargoHeightM: number | null;
  loadingAccessType: HubLoadingAccessType;
  ownership: "COMPANY" | "DRIVER";
  /** "Active" when a driver currently holds it. */
  status: "Active" | "Idle";
  assignment: HubVehicleAssignment | null;
  /** Null for a vehicle that was never part of a fleet application. */
  reviewStatus: HubVehicleReviewStatus | null;
  /** Whether a company may dispatch a job onto this vehicle. */
  dispatchable: boolean;
  createdAt: string;
  /**
   * This vehicle's registration and insurance — always both, in that order —
   * for a vehicle the signed-in driver **owns**. Null for every other vehicle:
   * a `ROSTER` driver's company vehicle and a `BUSINESS` account's fleet, whose
   * documents are not collected on this surface. Null is "not shown here", not
   * "missing".
   */
  documents: HubVehicleDocument[] | null;
};

/** The two documents a vehicle carries. */
export type VehicleDocumentType = "REGISTRATION" | "INSURANCE";

/**
 * The one word for a vehicle document, for a status pill:
 *
 * - `MISSING` — nothing accepted, nothing awaiting review. Not an error.
 * - `UNDER_REVIEW` — an upload is with the back office.
 * - `FLAGGED` — the latest upload was refused; see `submission.flagReason`.
 * - `VALID` / `EXPIRING` / `EXPIRED` — the document on file, by the calendar.
 *
 * A submission outranks the document on file. **A renewal does not replace the
 * document on file until it is approved**, so while `state` is `UNDER_REVIEW`
 * or `FLAGGED`, `onFile` still says whether the vehicle is covered.
 */
export type VehicleDocumentState =
  "MISSING" | "UNDER_REVIEW" | "FLAGGED" | "VALID" | "EXPIRING" | "EXPIRED";

export type HubVehicleDocument = {
  type: VehicleDocumentType;
  state: VehicleDocumentState;
  /** The approved document on file, or null when none has been accepted. */
  onFile: {
    id: string;
    /**
     * `YYYY-MM-DD`, recorded by the reviewer at approval. Null means the
     * document has no expiry (a registration certificate usually has none).
     */
    expiresAt: string | null;
    /** 0 on the last valid day, negative once expired; null with `expiresAt`. */
    daysUntilExpiry: number | null;
    validity: "VALID" | "EXPIRING" | "EXPIRED";
    approvedAt: string | null;
  } | null;
  /** The upload awaiting review, or refused by it; null when there is none. */
  submission: {
    id: string;
    status: "PENDING" | "FLAGGED";
    /** The reviewer's reason, localised, when `status` is `FLAGGED`. */
    flagReason: string | null;
    uploadedAt: string;
  } | null;
};

export type HubVehicleClassCount = {
  /** Null when vehicles of differing declared classes share one label. */
  vehicleClass: HubVehicleClass | null;
  label: string;
  count: number;
};

export type HubVehiclesResponse = {
  kind: HubAccountKind;
  persona: HubPersona;
  /** False for a `ROSTER` driver, who drives the company's vehicles. */
  canAddVehicle: boolean;
  /**
   * Owned vehicles plus, for a driver, any currently assigned to them — a
   * `ROSTER` driver's company vehicle carries the same fields as an owned one.
   */
  vehicles: HubVehiclesItem[];
  tiles: {
    vehicleCount: number;
    classBreakdown: HubVehicleClassCount[];
    /** Vehicles a driver currently holds. */
    onTheRoadCount: number;
    unassignedCount: number;
  };
};

/* ------------------------------------------------------------------------- */
/* Vehicle documents — /api/driver-profile/vehicles/[id]/documents           */
/* ------------------------------------------------------------------------- */

/**
 * Why a vehicle-documents request was refused.
 *
 * - `UNAUTHENTICATED` (401), `PASSWORD_CHANGE_REQUIRED` (403),
 *   `PROFILE_MISSING` (403) — as on every hub route.
 * - `ROLE_NOT_ALLOWED` (403) — not a driver account (a company, a client).
 * - `NOT_FOUND` (404) — no such vehicle, **or one that is not this driver's**;
 *   the two are deliberately indistinguishable.
 * - `NOT_VEHICLE_OWNER` (403) — a company vehicle assigned to this (`ROSTER`)
 *   driver. Its documents are the company's to manage.
 * - `INVALID_REQUEST` (400) — the body is malformed, or `path` was not issued
 *   for this vehicle and type.
 * - `UNSUPPORTED_CONTENT_TYPE` (400) — not `image/jpeg` or `image/png`, judged
 *   by what Storage recorded.
 * - `FILE_TOO_LARGE` (400) — over 10 MB.
 * - `UPLOAD_NOT_FOUND` (400) — nothing was uploaded to `path`. Upload, then
 *   register again.
 * - `STORAGE_UNAVAILABLE` (502) — Storage could not issue the upload URL.
 */
export type VehicleDocumentErrorCode =
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "ROLE_NOT_ALLOWED"
  | "PROFILE_MISSING"
  | "NOT_FOUND"
  | "NOT_VEHICLE_OWNER"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "FILE_TOO_LARGE"
  | "UPLOAD_NOT_FOUND"
  /**
   * 429 from `POST …/documents/upload-url` only: too many upload URLs were
   * issued for this vehicle and never registered. Carries `Retry-After`.
   */
  | "TOO_MANY_PENDING_UPLOADS"
  | "STORAGE_UNAVAILABLE";

export type VehicleDocumentErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: VehicleDocumentErrorCode;
};

/** One upload in a vehicle's document history. */
export type VehicleDocumentHistoryItem = {
  id: string;
  type: VehicleDocumentType;
  status: "PENDING" | "APPROVED" | "FLAGGED";
  /** Localised; set when `status` is `FLAGGED`. */
  flagReason: string | null;
  /** `YYYY-MM-DD`; set at approval. */
  expiresAt: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  /**
   * When a later upload or approval replaced this one; null for the rows
   * `documents` is built from.
   */
  supersededAt: string | null;
};

/**
 * `GET /api/driver-profile/vehicles/[id]/documents` — 200, and the body of a
 * successful register. Only for a vehicle the driver owns.
 *
 * Errors (`VehicleDocumentErrorResponse`): `UNAUTHENTICATED`,
 * `PASSWORD_CHANGE_REQUIRED`, `ROLE_NOT_ALLOWED`, `PROFILE_MISSING`,
 * `NOT_FOUND`, `NOT_VEHICLE_OWNER`.
 */
export type VehicleDocumentsResponse = {
  vehicleId: string;
  plateNumber: string;
  /** Both types, registration first — the same value `hub/vehicles` carries. */
  documents: HubVehicleDocument[];
  /** Every upload ever registered for this vehicle, newest first. */
  history: VehicleDocumentHistoryItem[];
};

/**
 * `POST /api/driver-profile/vehicles/[id]/documents/upload-url` body. Step 1 of
 * 3, for a first upload and a renewal alike. Allowed at any time, including
 * after the driver's application is approved.
 */
export type VehicleDocumentUploadUrlRequest = {
  type: VehicleDocumentType;
  fileName: string;
  /** `image/jpeg` or `image/png`. */
  contentType: string;
};

/**
 * `POST …/documents/upload-url` — 200. Upload the bytes straight to Supabase
 * Storage (bucket `driver-documents`) with `path` and `token` — or PUT them to
 * `signedUrl` — **sending the same `Content-Type`**, then record `path` with
 * `VehicleDocumentRegisterRequest`. Nothing is recorded until then.
 *
 * Errors: those of the GET, plus `INVALID_REQUEST`,
 * `UNSUPPORTED_CONTENT_TYPE`, `STORAGE_UNAVAILABLE`.
 */
export type VehicleDocumentUploadUrlResponse = {
  path: string;
  signedUrl: string;
  token: string;
};

/**
 * `POST /api/driver-profile/vehicles/[id]/documents` body: record a file
 * already uploaded to `path`. It becomes the type's `submission`
 * (`UNDER_REVIEW`), replacing an earlier upload that was never approved; the
 * document on file is untouched until a reviewer approves the new one. No
 * expiry date is sent — the reviewer reads it off the document.
 *
 * Registering the same `path` twice succeeds without changing anything.
 *
 * Errors: those of the GET, plus `INVALID_REQUEST`, `UPLOAD_NOT_FOUND`,
 * `UNSUPPORTED_CONTENT_TYPE`, `FILE_TOO_LARGE`.
 */
export type VehicleDocumentRegisterRequest = {
  type: VehicleDocumentType;
  path: string;
};

/* ------------------------------------------------------------------------- */
/* Support messages — /api/dashboard/hub/support/messages                    */
/* ------------------------------------------------------------------------- */

/**
 * What a support message is about. Two screens send one, each with its own
 * list:
 *
 * **Support** (five, in order): `PICKUP_OR_DROPOFF` "Problem at pick-up or
 * drop-off", `CARGO_DAMAGED_OR_MISSING` "Cargo damaged or missing",
 * `PAYMENT_OR_WITHDRAWAL` "Payment or withdrawal", `DOCUMENTS_AND_ACCOUNT`
 * "Documents and account", `OTHER` "Something else".
 *
 * **Orders → Report a problem** (seven, in order): `CONTACT_UNREACHABLE`
 * "Can't reach the contact", `ADDRESS_WRONG_OR_INACCESSIBLE` "Address is wrong
 * or inaccessible", `CARGO_MISMATCH` "Cargo doesn't match the listing",
 * `CARGO_DAMAGED_OR_MISSING` "Cargo damaged", `VEHICLE_BREAKDOWN` "Vehicle
 * breakdown", `ACCIDENT` "Accident", `OTHER` "Something else".
 *
 * Every value is accepted from either screen. A report is a message like any
 * other: no photos, and no reply thread.
 */
export type SupportTopic =
  | "PICKUP_OR_DROPOFF"
  | "CARGO_DAMAGED_OR_MISSING"
  | "PAYMENT_OR_WITHDRAWAL"
  | "DOCUMENTS_AND_ACCOUNT"
  | "OTHER"
  | "CONTACT_UNREACHABLE"
  | "ADDRESS_WRONG_OR_INACCESSIBLE"
  | "CARGO_MISMATCH"
  | "VEHICLE_BREAKDOWN"
  | "ACCIDENT";

/** `RESOLVED` once a member of staff has dealt with it. */
export type SupportMessageStatus = "OPEN" | "RESOLVED";

/**
 * One message the driver sent.
 *
 * **There is no reply on this type because there is no reply channel** — no
 * SMS, no push, no in-app thread. Staff read the message and phone the driver.
 * Do not promise the driver a reply by SMS or a response time; `status` is all
 * the server knows.
 */
export type SupportMessage = {
  id: string;
  topic: SupportTopic;
  /** What the driver wrote, trimmed. */
  body: string;
  status: SupportMessageStatus;
  /** The job the message is about, when one was attached and still exists. */
  order: { id: string; reference: string } | null;
  createdAt: string;
  resolvedAt: string | null;
};

/**
 * Why a support-messages request was refused.
 *
 * - `UNAUTHENTICATED` (401), `PASSWORD_CHANGE_REQUIRED` (403),
 *   `PROFILE_MISSING` (403) — as on every hub route.
 * - `ROLE_NOT_ALLOWED` (403) — not a driver account.
 * - `INVALID_REQUEST` (400) — malformed body, unknown `topic`, empty `body`, or
 *   one over 2000 characters.
 * - `ORDER_NOT_FOUND` (404) — `orderId` names no order, **or one this driver
 *   was never assigned**; the two are indistinguishable.
 * - `RATE_LIMITED` (429) — more than five messages in ten minutes.
 */
export type SupportMessageErrorCode =
  | "UNAUTHENTICATED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "ROLE_NOT_ALLOWED"
  | "PROFILE_MISSING"
  | "INVALID_REQUEST"
  | "ORDER_NOT_FOUND"
  | "RATE_LIMITED";

export type SupportMessageErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: SupportMessageErrorCode;
};

/** `POST /api/dashboard/hub/support/messages` body. */
export type SupportMessageCreateRequest = {
  topic: SupportTopic;
  /** "What happened?" — required, trimmed, 2000 characters at most. */
  body: string;
  /** The "About job" attachment: an order assigned to this driver. Optional. */
  orderId?: string | null;
};

/** `POST /api/dashboard/hub/support/messages` — **201**. */
export type SupportMessageCreateResponse = { message: SupportMessage };

/**
 * `GET /api/dashboard/hub/support/messages` — 200: the driver's own messages,
 * newest first, at most 20.
 *
 * Errors (`SupportMessageErrorResponse`): `UNAUTHENTICATED`,
 * `PASSWORD_CHANGE_REQUIRED`, `ROLE_NOT_ALLOWED`, `PROFILE_MISSING`.
 */
export type SupportMessagesResponse = { messages: SupportMessage[] };

/* ------------------------------------------------------------------------- */
/* GET /api/dashboard/hub/account                                            */
/* ------------------------------------------------------------------------- */

export type HubAccountDriverSettings = {
  shape: "DRIVER";
  email: string;
  accountType: string; // DriverAccountType
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  vatId: string | null;
  phone: string;
  /** The stored city value (not a display label) — the driver's home base. */
  city: string;
  /**
   * Who to call if something happens on a job. Each is null until the driver
   * sets it; the phone is E.164 (`+995577301922`).
   */
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  idNumber: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  /**
   * When the licence on file expires, `YYYY-MM-DD`; null when none is on file
   * (a driver a company registered never submitted one).
   */
  licenceExpiresAt: string | null;
  /**
   * The driver's live onboarding documents with the back office's verdict on
   * each. Empty when the driver has no application. No image URL here — the
   * onboarding route (`OnboardingGetResponse.documents`) carries those.
   */
  documents: HubAccountDocument[];
};

/** One document on file, and where its review stands. */
export type HubAccountDocument = {
  type: DriverApplicationDocumentType;
  status: DriverApplicationDocumentStatus;
  /** The reviewer's reason, when `status` is `FLAGGED`. */
  flagReason: string | null;
};

export type HubAccountCompanySettings = {
  shape: "COMPANY";
  email: string;
  companyName: string;
  vatId: string;
  phone: string;
  /** Display label ("Tbilisi"). */
  city: string;
  registeredAddress: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  /** The last four characters of the payout IBAN; the full IBAN never leaves the server. */
  payoutIbanLast4: string | null;
};

/** Discriminated on `shape`: a driver's own profile, or a company's. */
export type HubAccountResponse =
  HubAccountDriverSettings | HubAccountCompanySettings;

/* ------------------------------------------------------------------------- */
/* A driver's own settings — errors                                          */
/* ------------------------------------------------------------------------- */

/**
 * Why a settings request (profile, notification settings, route alerts, work
 * preferences) was refused.
 *
 * - `UNAUTHENTICATED` (401), `PASSWORD_CHANGE_REQUIRED` (403),
 *   `PROFILE_MISSING` (403) — as on every hub route.
 * - `ROLE_NOT_ALLOWED` (403) — not a driver account (a logistics company has
 *   none of these settings).
 * - `INVALID_REQUEST` (400) — the body is not a JSON object, carries no field
 *   to change, or a field is malformed; `error` names the field.
 * - `ALERT_NOT_FOUND` (404) — the route alert does not exist **or is another
 *   driver's**; the two are indistinguishable.
 * - `ALERT_LIMIT_REACHED` (409) — the driver already has ten route alerts.
 */
export type HubSettingsErrorCode =
  | HubApiErrorCode
  | "INVALID_REQUEST"
  | "ALERT_NOT_FOUND"
  | "ALERT_LIMIT_REACHED";

export type HubSettingsErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: HubSettingsErrorCode;
};

/** A day of the week. Monday first, as the design's chips are. */
export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** A handling requirement a client attached to a load. */
export type CargoHandlingTag =
  | "FRAGILE"
  | "COLD_CHAIN"
  | "HAZMAT"
  | "TIME_CRITICAL"
  | "UPRIGHT_ONLY"
  | "HEAVY_ITEM";

/* ------------------------------------------------------------------------- */
/* PATCH /api/dashboard/hub/account/profile                                  */
/* ------------------------------------------------------------------------- */

/**
 * What a driver may change about their own profile: home base and emergency
 * contact, and nothing else. Send only the fields to change.
 *
 * Name, ID number and date of birth are verified at onboarding and are
 * read-only here. **The sign-in phone number cannot be changed through this
 * route** (there is no endpoint for it yet), and the contact email is the
 * account's sign-in email, changed through the auth API.
 *
 * 200: the driver's `HubAccountDriverSettings`, as `GET
 * /api/dashboard/hub/account` would now return it.
 */
export type HubDriverProfileUpdateRequest = {
  /** Home base. A `GeorgianCity` value. */
  city?: GeorgianCity;
  /** 100 characters at most after trimming; null or "" clears it. */
  emergencyContactName?: string | null;
  /**
   * A Georgian mobile number in any usual spelling ("577 30 19 22",
   * "+995577301922"); stored and returned as E.164. Null or "" clears it.
   */
  emergencyContactPhone?: string | null;
};

/* ------------------------------------------------------------------------- */
/* /api/dashboard/hub/notification-settings                                  */
/* ------------------------------------------------------------------------- */

/**
 * Which pushes the driver wants: the six rows of Account → Notifications, and
 * quiet hours.
 *
 * A driver who never opened the screen gets the defaults: everything on
 * except `tipsAndPromotions`, quiet hours off at 23:00–07:00.
 *
 * **Only `loadOffers` and `routeAlerts` are acted on today** — they are the
 * only pushes this backend sends. `jobReminders`, `payouts`, `documentExpiry`
 * and `tipsAndPromotions` are stored (or fixed) preferences with no sender
 * behind them yet: switching them changes nothing the driver receives.
 */
export type HubNotificationSettings = {
  /** "New load offers". Off: no offer push; the app's poll still finds offers. */
  loadOffers: boolean;
  /** "Route alerts". */
  routeAlerts: boolean;
  /** "Job reminders". No sender yet. */
  jobReminders: boolean;
  /** "Payouts and withdrawals". No sender yet. */
  payouts: boolean;
  /** "Document expiry" — the design's "Always on" row. Always true. */
  documentExpiry: true;
  /** "Tips and promotions". No sender yet. */
  tipsAndPromotions: boolean;
  /**
   * While `enabled`, non-urgent pushes are **not sent** between `start` and
   * `end` (24-hour `HH:MM`, on the `timeZone` wall clock; the window may wrap
   * past midnight). They are dropped, not delivered in the morning.
   *
   * Urgent, and so never held back: `loadOffers` and `jobReminders`. Of the
   * two pushes that exist, quiet hours therefore silence route alerts only.
   */
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    /** Always `Asia/Tbilisi`; not changeable. */
    timeZone: "Asia/Tbilisi";
  };
};

export type HubNotificationSettingsResponse = {
  settings: HubNotificationSettings;
};

/**
 * `PATCH /api/dashboard/hub/notification-settings`. Send only what changes;
 * everything left out keeps its value. `documentExpiry: false` is refused.
 * `start` and `end` may not be equal.
 */
export type HubNotificationSettingsUpdateRequest = {
  loadOffers?: boolean;
  routeAlerts?: boolean;
  jobReminders?: boolean;
  payouts?: boolean;
  tipsAndPromotions?: boolean;
  quietHours?: { enabled?: boolean; start?: string; end?: string };
};

/* ------------------------------------------------------------------------- */
/* /api/dashboard/hub/route-alerts                                           */
/* ------------------------------------------------------------------------- */

/**
 * A saved route: "tell me about loads from `fromCity` to `toCity` paying at
 * least `minPayout`, picked up on one of `days`".
 *
 * When a load opens that matches an enabled alert — and one of the driver's
 * vehicles could take it — the driver is sent one push (`RouteAlertPushData`),
 * once per load. How many open loads match *now* is not on this type: count
 * them from `GET /api/loads`.
 */
export type HubRouteAlert = {
  id: string;
  fromCity: GeorgianCity;
  /** Null is "anywhere". */
  toCity: GeorgianCity | null;
  /** GEL, against the driver's payout. `0` is "any payout". */
  minPayout: number;
  /**
   * Weekdays of the pick-up, Tbilisi time. Never empty; all seven is "Any
   * day", `MON`–`FRI` "Weekdays", `SAT`+`SUN` "Weekends".
   */
  days: Weekday[];
  enabled: boolean;
  createdAt: string;
};

/** `GET /api/dashboard/hub/route-alerts` — oldest first. */
export type HubRouteAlertsResponse = {
  alerts: HubRouteAlert[];
  /** How many alerts a driver may save (10). */
  limit: number;
};

/**
 * `POST /api/dashboard/hub/route-alerts` — **201**. Only `fromCity` is
 * required; the rest default to anywhere, any payout, every day, on.
 */
export type HubRouteAlertCreateRequest = {
  fromCity: GeorgianCity;
  toCity?: GeorgianCity | null;
  minPayout?: number;
  days?: Weekday[];
  enabled?: boolean;
};

/** `PATCH /api/dashboard/hub/route-alerts/[id]`. Send only what changes. */
export type HubRouteAlertUpdateRequest = Partial<HubRouteAlertCreateRequest>;

export type HubRouteAlertResponse = { alert: HubRouteAlert };

/** `DELETE /api/dashboard/hub/route-alerts/[id]`. */
export type HubRouteAlertDeleteResponse = { deleted: true };

/**
 * The `data` object of a route-alert push. Like an offer push, the title and
 * body are generic and localised and **nothing about the load is in it** — no
 * city, address, name or amount. Open the load from `GET /api/loads`.
 */
export type RouteAlertPushData = {
  type: "ROUTE_ALERT";
  alertId: string;
  orderId: string;
};

/* ------------------------------------------------------------------------- */
/* /api/dashboard/hub/work-preferences                                       */
/* ------------------------------------------------------------------------- */

/**
 * What work the driver wants to be **offered** (Account → Work preferences).
 *
 * These filter pushed load offers only. **`GET /api/loads` is not filtered by
 * them** — the driver can still browse and claim anything they are eligible
 * for — and neither are route alerts.
 *
 * A load is not offered when:
 *
 * - it is outside the areas: both ends in `cities` is inside; otherwise the
 *   job leaves town and needs `intercity`, and must start in one of `cities`
 *   (or `cities` must be empty — intercity work from anywhere);
 * - its route is longer than `maxTripKm`;
 * - the offer would be sent outside `days` / `hours` (Tbilisi time — when the
 *   offer is made, not when the pick-up is);
 * - it carries one of `excludedHandlingTags`;
 * - it asks for helpers and `canBringHelper` is false.
 */
export type HubWorkPreferences = {
  cities: GeorgianCity[];
  /** The design's "Intercity" chip. */
  intercity: boolean;
  /** "Longest trip I'll take", km. Null is "Any". */
  maxTripKm: number | null;
  /** Never empty. */
  days: Weekday[];
  /** 24-hour `HH:MM`. Equal `start` and `end` mean all day. */
  hours: { start: string; end: string; timeZone: "Asia/Tbilisi" };
  /**
   * The inverse of the design's "Cargo I'll carry": what the driver will
   * **not** carry. "Fragile" → `FRAGILE`, "Heavy lift" → `HEAVY_ITEM`,
   * "Chilled food" → `COLD_CHAIN`, "Hazardous" → `HAZMAT`. The design's
   * "General" row has no counterpart and is not sent.
   */
  excludedHandlingTags: CargoHandlingTag[];
  /** "I can bring a helper". */
  canBringHelper: boolean;
};

/**
 * `preferences` is **null until the driver first saves** — and until then
 * offers are made exactly as if this feature did not exist.
 */
export type HubWorkPreferencesResponse = {
  preferences: HubWorkPreferences | null;
};

/**
 * `PATCH /api/dashboard/hub/work-preferences`. Send only what changes. A first
 * save starts from "nothing restricted" (any trip, every day, all day, no
 * cargo excluded, helper yes) and must name an area: at least one of `cities`
 * or `intercity: true`.
 */
export type HubWorkPreferencesUpdateRequest = {
  cities?: GeorgianCity[];
  intercity?: boolean;
  maxTripKm?: number | null;
  days?: Weekday[];
  hours?: { start?: string; end?: string };
  excludedHandlingTags?: CargoHandlingTag[];
  canBringHelper?: boolean;
};

/* ------------------------------------------------------------------------- */
/* GET /api/loads                                                            */
/* ------------------------------------------------------------------------- */

/** The shape every failure of `GET /api/loads` answers with. */
export type LoadBoardError = { error: string };

/**
 * One row of the load board response.
 *
 * `driverPayout` and `ratePerKm` are the ONLY money figures here — there is no
 * `price` field on this type and there must never be one. See the `GET /api/loads` handler's
 * doc comment.
 *
 * Every timestamp is an ISO string rather than a `Date`: this crosses the wire
 * as JSON and is consumed by client components, so the type states what the
 * consumer actually receives.
 */
export type LoadBoardItem = {
  id: string;
  reference: string;
  status: "available" | "claimed" | "mine";
  cargoCategory: string;
  description: string | null;
  bodyType: string | null;
  helperCount: number;
  scheduledAt: string | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  pickupCity: string | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  dropoffCity: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactDetails: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  distanceKm: number;
  /**
   * NOT in the approved design — see the `GET /api/loads` handler's doc comment.
   *
   * Null whenever it cannot be measured: the driver has never pushed a
   * location, or the order was booked against an address the geocoder could not
   * place. Always null for a COMPANY session, which has no single location of
   * its own. Never used to filter, only to inform and sort.
   */
  pickupDistanceKm: number | null;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: string[]; // CargoHandlingTag[]
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  /** The driver's own share, read from the stored column. Never `Order.price`. */
  driverPayout: number;
  /** `driverPayout` per kilometre, or null when the trip has no distance. */
  ratePerKm: number | null;
  serviceLevel: string;
  vehicleTypeSpecId: string;
  driverId: string | null;
  companyId: string | null;
  vehicleId: string | null;
  /**
   * Whether **this account** can dispatch this order right now — i.e. whether
   * `GET/POST /api/logistics-company/orders/[id]/dispatch(-options)` would
   * answer rather than 404.
   *
   * Derived here, where `Order.status` is in scope, because the board's own
   * `status` above is a three-value vocabulary (`available`/`claimed`/`mine`)
   * and deliberately not the raw `OrderStatus`. A consumer therefore **cannot**
   * work this out from what it is given, and the two obvious attempts are both
   * wrong on data that exists today:
   *
   * - `status === "mine"` is far too wide: `MINE_STATUSES` puts CLAIMED,
   *   ACCEPTED and IN_TRANSIT alike into `mine`.
   * - `driverId === null` looks exact and is not. It assumes the only way to
   *   reach ACCEPTED is the dispatch write, which pairs a driver with the
   *   status change. The *flow* does guarantee that; the *data* does not. The
   *   driver-hub fixture seeds `fleet-active-unassigned` as ACCEPTED with a
   *   null `driverId` **and** a null `vehicleId` on purpose, to exercise the
   *   fleet header pill's "Unassigned" sub-line, and that row sits in `mine`
   *   directly beside a genuinely claimed one. A board gating on `driverId`
   *   offers a dispatch control on it that 404s on press.
   *
   * Exporting the raw `OrderStatus` instead was rejected: it would hand every
   * driver-facing surface a fourth status vocabulary to get wrong, when the
   * only question any of them asks is this one. The answer is the precondition
   * both dispatch routes scope on, `{ companyId, status: CLAIMED }`, plus the
   * per-account `"mine"` — so it is "can *you* dispatch this", not "is this
   * dispatchable by somebody", and it is never true for another company's row.
   *
   * It is not a promise the press will succeed. A dispatcher can assign the
   * load from a second tab between this response and a click, and the fleet
   * activation gate is a 403 this flag knows nothing about. It removes the
   * control that is *predictably* broken; the dialog still reports the rest.
   */
  dispatchable: boolean;
  /** NOT in the approved design — see the `GET /api/loads` handler's doc comment. */
  createdAt: string;
  /** The claim instant for a `"claimed"` row; the UI derives "N min ago" from this. */
  updatedAt: string;
};

export type LoadBoardResponse = {
  available: LoadBoardItem[];
  mine: LoadBoardItem[];
  rejected: LoadBoardItem[];
  /**
   * How many open, non-rejected loads were withheld because **none of this
   * account's vehicles that were otherwise allowed to take them could
   * physically carry them** — over the payload, or over one of the three
   * dimensions.
   *
   * The board's footer prints this as *"N loads hidden — over your vehicle
   * capacity or dimensions"*, and this count is scoped precisely so that
   * sentence stays true of every load it counts.
   *
   * **Its denominator changed when exact-class matching became upgrade-based
   * substitution, and the sentence survives that unchanged.** It used to count
   * loads that a vehicle *of the booked class* was measured against and found
   * too small for; it now counts loads that every vehicle *permitted to
   * substitute for the booked class* — registered under it, or big enough on all
   * four axes — and offering the right body was measured against and found too
   * small for.
   *
   * **That denominator is not simply larger, and this number can move either
   * way.** Substitution adds candidates that exact-class matching refused
   * (anything bigger, of any class) and removes candidates it allowed: the old
   * rule tested the class id and nothing else, so a vehicle of the booked class
   * whose class does not offer the order's `bodyType` used to qualify and no
   * longer does. `POST /api/orders` now refuses a booking naming a body its own
   * class lacks, so that is a historical shape rather than one new orders can
   * take — but historical rows are most of what a board of legacy `PENDING`
   * orders is. So a load that had a candidate can lose its last one and become
   * `NO_ELIGIBLE_VEHICLE`, dropping out of this count entirely — and a load that
   * had *no* candidate under the old rule, and was therefore dropped uncounted,
   * can gain a bigger substitute that it does not fit and be counted here for the
   * first time. The figure can rise. Read it as "loads a permitted vehicle was
   * measured against and found too small for", never as a trend line.
   *
   * A consequence worth knowing before reading a low number as a bug: a load
   * whose declared envelope fits *the class the client booked* is counted only
   * in the narrow case where the candidate that admitted it is one of the
   * under-declared vehicles the identity clause lets through — every other
   * candidate meets or beats the booked class on all four axes and therefore
   * takes anything that class would. What remains countable is otherwise exactly
   * the loads whose declared envelope exceeds their own booked class
   * (`POST /api/orders` refuses those at booking, so they are historical rows
   * predating that guard) and the partially declared ones `loadFits` refuses
   * all-or-nothing. On a healthy book this figure is therefore usually zero,
   * which is the truth and not a broken counter.
   *
   * **A load whose cargo envelope was never declared is NOT counted here, and
   * is not hidden either — it is listed like any other.** It used to be both,
   * because `loadFits` resolves an undeclared envelope to "does not fit" and
   * this route mapped every non-fit to `OVER_CAPACITY`. That made the footer
   * state something untrue about the driver's own vehicle, and it contradicted
   * `POST /api/orders/[id]/accept`, which has always let such an order be
   * claimed — the board hiding work the claim path would have handed over. The
   * envelope case is now split off by `classifyFit`'s `UNDECLARED` verdict; see
   * `LoadFitVerdict` in src/lib/orders/vehicle-fit.ts for the full argument and
   * for why this mattered on the day the feature shipped rather than later.
   *
   * **Loads this account has no permitted vehicle for at all are NOT counted
   * here, and are not counted anywhere else either.** They are simply absent. A
   * load booked as a refrigerated truck is not "over the capacity" of a driver
   * whose only vehicle is a dry van — it is work that driver was never eligible
   * for, and rolling it into this number would make the footer lie about loads
   * that a bigger van would not unlock. Reporting it separately was the
   * alternative; see `eligibilityOf` in the `GET /api/loads` handler for why it was not
   * taken.
   */
  hiddenByCapacityCount: number;
};

/* ------------------------------------------------------------------------- */
/* Driver onboarding — errors and shared vocabulary                          */
/* ------------------------------------------------------------------------- */

/**
 * The body of every handled non-2xx answer from `/api/driver-profile/*`.
 *
 * There is **no machine code** on these routes — only the HTTP status and this
 * prose, localised from the `NEXT_LOCALE` cookie, else the `Referer`'s `/ka` or
 * `/en` path prefix, else Georgian. Branch on the status, never on the text.
 *
 * Statuses every `/api/driver-profile/*` route below shares:
 *
 * - 401 — no session.
 * - 403 — signed in, but `role` is not `DRIVER`.
 *
 * An unhandled server fault (a database error, say) is a bare 500 whose body
 * is not this shape and may not be JSON at all.
 */
export type DriverApiError = { error: string };

export type DriverAccountType =
  "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "BUSINESS";

/** The stored city value. Display labels are not on the wire. */
export type GeorgianCity =
  | "TBILISI"
  | "BATUMI"
  | "KUTAISI"
  | "RUSTAVI"
  | "ZUGDIDI"
  | "GORI"
  | "POTI"
  | "SAMTREDIA"
  | "KHASHURI"
  | "SENAKI"
  | "ZESTAPONI"
  | "MARNEULI"
  | "TELAVI"
  | "AKHALTSIKHE"
  | "OZURGETI"
  | "KOBULETI"
  | "CHIATURA"
  | "TSKALTUBO"
  | "SAGAREJO"
  | "GARDABANI"
  | "BOLNISI"
  | "AKHALKALAKI"
  | "BORJOMI"
  | "KASPI"
  | "MTSKHETA"
  | "TKIBULI"
  | "KARELI"
  | "GURJAANI"
  | "KVARELI"
  | "LANCHKHUTI"
  | "SACHKHERE"
  | "TERJOLA"
  | "KHOBI"
  | "MARTVILI"
  | "TSALENJIKHA"
  | "ABASHA"
  | "AMBROLAURI"
  | "TSAGERI"
  | "ONI"
  | "MESTIA"
  | "SIGHNAGHI"
  | "DEDOPLISTSQARO"
  | "LAGODEKHI"
  | "AKHMETA"
  | "DUSHETI"
  | "TIANETI"
  | "TSALKA"
  | "DMANISI"
  | "TETRITSQARO"
  | "NINOTSMINDA"
  | "ADIGENI"
  | "ASPINDZA"
  | "VALE"
  | "BAGHDATI"
  | "VANI"
  | "KHARAGAULI"
  | "KHONI"
  | "CHKHOROTSQU"
  | "JVARI"
  | "KEDA"
  | "KHELVACHAURI"
  | "KHULO"
  | "SHUAKHEVI";

export type DriverLicenceCategory = "B" | "C" | "CE";

/** A vehicle's cargo body, as stored (not the `HubJobBodyType` display label). */
export type DriverChassisType = "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";

export type DriverApplicationStatus =
  "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED";

export type DriverApplicationDocumentType =
  "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK";

/** The back office's verdict on one uploaded document. */
export type DriverApplicationDocumentStatus =
  "PENDING" | "APPROVED" | "FLAGGED";

/* ------------------------------------------------------------------------- */
/* GET, POST /api/driver-profile                                             */
/* ------------------------------------------------------------------------- */

/**
 * The driver's profile row, exactly as stored — the handlers serialise the
 * whole database row, so a column added to `DriverProfile` appears on the wire
 * without this type changing.
 */
export type DriverProfile = {
  id: string;
  userId: string;
  isOnline: boolean;
  city: GeorgianCity;
  accountType: DriverAccountType;
  /** Null for a `BUSINESS` account. */
  firstName: string | null;
  lastName: string | null;
  /** Null unless the account is `BUSINESS`. */
  companyName: string | null;
  vatId: string | null;
  phone: string;
  /** Null until an onboarding application has been submitted. */
  idNumber: string | null;
  dateOfBirth: string | null;
  /** A Storage object path, not a URL. */
  profilePhotoPath: string | null;
  /** The employer of a roster driver. */
  companyId: string | null;
  /** Null until the account is approved; going online requires it. */
  activatedAt: string | null;
  currentLat: number | null;
  currentLng: number | null;
  locationUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * `GET /api/driver-profile` — 200. The body is the JSON literal `null` when
 * the driver has no profile yet; that is a valid state, not an error.
 *
 * Errors (`DriverApiError`): 401, 403 only.
 */
export type DriverProfileGetResponse = DriverProfile | null;

/**
 * `POST /api/driver-profile` body. An upsert: it creates the profile, or
 * updates the name, company, phone and city of an existing one.
 *
 * - `BUSINESS` requires `companyName` and `vatId`; `firstName` and `lastName`
 *   are ignored and stored as null.
 * - The other two types require `firstName` and `lastName`; `companyName` and
 *   `vatId` are ignored and stored as null.
 * - `accountType` is fixed at creation: sending a different one later is a 400.
 * - Strings are trimmed; a blank one counts as missing. `phone` has no format
 *   check here (the onboarding submit enforces 10–15 digits).
 */
export type DriverProfileUpsertRequest = {
  accountType: DriverAccountType;
  city: GeorgianCity;
  phone: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  vatId?: string;
};

/**
 * `POST /api/driver-profile` — **201** on create and on update alike.
 *
 * Errors (`DriverApiError`): 401; 403; 400 for a body that is not a JSON
 * object, an unknown `accountType` or `city`, a missing required field, or an
 * `accountType` differing from the existing profile's.
 */
export type DriverProfileUpsertResponse = DriverProfile;

/* ------------------------------------------------------------------------- */
/* PATCH /api/driver-profile/status                                          */
/* ------------------------------------------------------------------------- */

export type DriverStatusUpdateRequest = { isOnline: boolean };

/**
 * `PATCH /api/driver-profile/status` — 200.
 *
 * Errors (`DriverApiError`): 401; 400 for invalid JSON or a non-boolean
 * `isOnline`; 404 when the driver has no profile; and 403 for three causes —
 * a pending forced password change (the one 403 here that carries
 * `code: "PASSWORD_CHANGE_REQUIRED"`), not a `DRIVER`, or going online before
 * the account is activated. Going offline is never refused for activation.
 */
export type DriverStatusUpdateResponse = { isOnline: boolean };

/* ------------------------------------------------------------------------- */
/* GET, PATCH /api/driver-profile/onboarding                                 */
/* ------------------------------------------------------------------------- */

/**
 * The in-progress wizard, saved as one versioned blob. Every field is
 * optional and nothing is validated on save — the rules run once, at submit.
 * Keys not listed here are stored and echoed back untouched.
 */
export type OnboardingDraft = {
  version: 1;
  personal?: {
    /** Submit requires 10–15 digits once non-digits are stripped. */
    phone?: string;
    /** Submit requires two words or more; the first becomes `firstName`. */
    fullName?: string;
    /** Submit requires 6–20 letters, digits or hyphens. */
    idNumber?: string;
    /** ISO date. Submit requires an age of 21–75 on the day of submission. */
    dateOfBirth?: string;
    /** A `GeorgianCity` value; typed loosely because the draft is unchecked. */
    city?: string;
  };
  licence?: {
    /** Submit requires 5 characters or more. */
    licenceNumber?: string;
    /** ISO date. Submit requires it to be in the future. */
    expiresAt?: string;
    categories?: DriverLicenceCategory[];
  };
  vehicle?: {
    chassisType?: DriverChassisType;
    /** Must hold a spec for `chassisType` — see `OnboardingVehicleClass`. */
    classId?: HubVehicleClass;
    make?: string;
    model?: string;
    /** Submit requires an integer from 1995 to the current year. */
    year?: number;
    colour?: string;
    /** Submit requires 4 characters or more, and upper-cases it. */
    plateNumber?: string;
    /** Submit requires 100–40,000, and no less than the class's own payload. */
    payloadKg?: number;
    /** Metres; submit requires each of the three to be above 0 and at most 20. */
    cargoLengthM?: number;
    cargoWidthM?: number;
    cargoHeightM?: number;
  };
};

/** One live (not superseded) document on the application. */
export type OnboardingDocument = {
  type: DriverApplicationDocumentType;
  status: DriverApplicationDocumentStatus;
  /** The reviewer's reason, when `status` is `FLAGGED`. */
  flagReason: string | null;
  /** A read URL valid for 5 minutes; null when signing failed. */
  signedUrl: string | null;
  uploadedAt: string;
};

/** What a successful submit stored, for the post-submission status screen. */
export type OnboardingSubmittedSummary = {
  fullName: string;
  idNumber: string;
  /** ISO timestamp; `""` if the stored row lacks it. */
  dateOfBirth: string;
  /** A `GeorgianCity` value. */
  city: string;
  licenceNumber: string;
  licenceExpiresAt: string;
  categories: string[]; // DriverLicenceCategory[]
  /** **English**, whatever the locale. */
  vehicleClassName: string;
  /** A `DriverChassisType` value, or `""` for an older vehicle. */
  chassisType: string;
  make: string;
  model: string;
  year: number;
  /** `""` when none was stored. */
  colour: string;
  plateNumber: string;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
};

/**
 * `GET /api/driver-profile/onboarding` — 200. Not a pure read: the first call
 * creates the application row, and every other onboarding route 404s until it
 * has been made.
 *
 * Errors (`DriverApiError`): 401; 403; 404 when the driver has no profile
 * (`POST /api/driver-profile` first); 500 when the application could not be
 * created.
 */
export type OnboardingGetResponse = {
  status: DriverApplicationStatus;
  /** The human-readable application code, e.g. "APP-40219". */
  reference: string;
  /** 1–4: the wizard step to resume at. */
  draftStep: number;
  draftUpdatedAt: string | null;
  /** Null once `status` is not `DRAFT`, and for a draft never saved. */
  draft: OnboardingDraft | null;
  documents: OnboardingDocument[];
  /** Null while `status` is `DRAFT`. */
  submittedSummary: OnboardingSubmittedSummary | null;
};

/**
 * `PATCH /api/driver-profile/onboarding` body. A whole-object replace, not a
 * merge: send the full draft every time, and debounce.
 *
 * Answers **204 with no body**.
 *
 * Errors (`DriverApiError`): 401; 403; 404 when there is no profile or no
 * application yet; 400 when the application is no longer `DRAFT`, the body is
 * not a JSON object, `draftStep` is not an integer from 1 to 4, `draft` is not
 * an object with `version: 1`, a present section is not an object, or the
 * serialised draft exceeds 65,536 characters.
 */
export type OnboardingSaveDraftRequest = {
  draftStep: number;
  draft: OnboardingDraft;
};

/* ------------------------------------------------------------------------- */
/* POST /api/driver-profile/onboarding/submit                                */
/* ------------------------------------------------------------------------- */

/**
 * `POST /api/driver-profile/onboarding/submit` — 200. **Takes no body**: any
 * body sent is ignored, and the last draft saved by `PATCH` is what gets
 * validated, so flush a pending save first. Also serves "resubmit" for an
 * `ACTION_REQUIRED` application, which re-checks age, licence expiry and
 * documents only.
 *
 * All three document types must be live and none `FLAGGED`.
 *
 * Errors (`DriverApiError`): 401; 403; 404 when there is no profile or no
 * application; 409 when the plate number is already registered; 500 on a
 * server fault; 400 for everything else — already `PENDING` or `APPROVED`, no
 * saved draft, or a failed rule. Only the **first** failed rule is reported,
 * as prose with no field name.
 */
export type OnboardingSubmitResponse = { status: "PENDING" };

/* ------------------------------------------------------------------------- */
/* POST /api/driver-profile/onboarding/reset                                 */
/* ------------------------------------------------------------------------- */

/**
 * `POST /api/driver-profile/onboarding/reset` takes no body and answers **204
 * with no body**, so there is no request or response type. It clears the
 * draft, returns to step 1 and retires every uploaded document; the
 * `reference` is kept.
 *
 * Errors (`DriverApiError`): 401; 403; 404 when there is no profile or no
 * application; 400 when the application is not `DRAFT`.
 */
export type OnboardingResetResponse = never;

/* ------------------------------------------------------------------------- */
/* POST /api/driver-profile/onboarding/documents/upload-url                  */
/* ------------------------------------------------------------------------- */

/**
 * Errors shared by both document routes (`DriverApiError`): 401; 403; 404 when
 * there is no profile or no application; 400 when the application is `PENDING`
 * or `APPROVED` (uploads are open in `DRAFT` and `ACTION_REQUIRED` only), the
 * body is not a JSON object, or `type` is unknown.
 */
export type OnboardingUploadUrlRequest = {
  /** Validated, but the issued URL is not tied to it. */
  type: DriverApplicationDocumentType;
  fileName: string;
  /** `image/jpeg` or `image/png` only. */
  contentType: string;
};

/**
 * `POST /api/driver-profile/onboarding/documents/upload-url` — 200. Step 1 of
 * 3: upload the bytes straight to Supabase Storage (bucket `driver-documents`)
 * with `path` and `token`, then record `path` via `OnboardingDocumentRequest`.
 *
 * Errors, beyond the shared ones: 400 for a blank `fileName` or `contentType`
 * or an unsupported type; 502 when Storage could not issue the URL.
 */
export type OnboardingUploadUrlResponse = {
  path: string;
  signedUrl: string;
  token: string;
};

/* ------------------------------------------------------------------------- */
/* POST /api/driver-profile/onboarding/documents                             */
/* ------------------------------------------------------------------------- */

/** `POST` is the only method this route exports — there is no list or delete. */
export type OnboardingDocumentRequest = {
  type: DriverApplicationDocumentType;
  /** The `path` from `OnboardingUploadUrlResponse`, already uploaded to. */
  path: string;
};

/**
 * `POST /api/driver-profile/onboarding/documents` — 200. Recording a type that
 * already has a document replaces it.
 *
 * The server reads the content type **Storage recorded for the object**, not
 * the one claimed when the URL was issued, so the upload itself must be sent
 * as `image/jpeg` or `image/png`; anything else is deleted and refused.
 *
 * Errors, beyond the shared ones: 400 for a blank `path`, a `path` not issued
 * to this driver, an object that cannot be found or verified, or an
 * unsupported stored content type; 409 when two uploads of the same `type`
 * race (retry).
 */
export type OnboardingDocumentResponse = {
  type: DriverApplicationDocumentType;
  status: "PENDING";
  /** A read URL valid for 5 minutes; null when signing failed after the save. */
  signedUrl: string | null;
  uploadedAt: string;
};

/* ------------------------------------------------------------------------- */
/* Onboarding vehicle classes                                                */
/* ------------------------------------------------------------------------- */

/**
 * One row of the wizard's vehicle-class table. This file declares types only,
 * so the five rows themselves are not here: mirror `VEHICLE_CLASSES` from
 * `src/lib/driver-onboarding/vehicle-classes.ts`.
 */
export type OnboardingVehicleClass = {
  id: HubVehicleClass;
  /** English. */
  name: string;
  /** Category chip, e.g. "CAT B". */
  chip: string;
  /** The licence category the driver must hold; enforced at submit. */
  requiredLicenceCategory: DriverLicenceCategory;
  /** English, e.g. "Up to 800 kg · 2 pallets". */
  capacityLine: string;
  /** Make and model names; the same in every locale. */
  samplesLine: string;
  /**
   * The `VehicleType.code` each body resolves to. Null means the pair is not
   * offered: lock it in the UI, because submit refuses it.
   */
  specCodeByChassis: Record<DriverChassisType, string | null>;
};

/* ------------------------------------------------------------------------- */
/* GET /api/vehicle-types                                                    */
/* ------------------------------------------------------------------------- */

/**
 * One vehicle type of the public catalogue.
 *
 * The wire object also carries a `pricingRule` key — the **client's** tariff.
 * It is deliberately left untyped, per the money convention in this file's
 * header; a driver client must not read it.
 */
export type VehicleType = {
  /** What `OnboardingVehicleClass.specCodeByChassis` resolves to. */
  code: string;
  /** English. */
  label: string;
  category: HubVehicleCategory;
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  loadingAccessType: HubLoadingAccessType;
  /** The cargo bodies this type is bookable with. */
  bodyTypes: DriverChassisType[];
  imageUrl: string | null;
  /** Whether any activated carrier could currently take a load of this type. */
  serviceable: boolean;
};

/**
 * `GET /api/vehicle-types` — 200, a bare array ordered by category then label.
 * Public: no session, no role. Some seeded types are withheld, so a `code`
 * from the class table may be absent here. No handled error status.
 */
export type VehicleTypesResponse = VehicleType[];

/* ------------------------------------------------------------------------- */
/* Phone sign-in — POST /api/auth/phone-number/{send-otp,verify}             */
/* ------------------------------------------------------------------------- */

/**
 * `POST /api/auth/phone-number/send-otp`. Any common spelling of the number is
 * accepted (`+995 555 12 34 56`, `555123456`, `0555123456`) and normalised to
 * E.164 server-side; a non-Georgian number must be written internationally.
 * Any key other than `phoneNumber` is a 400.
 */
export type PhoneSendOtpRequest = { phoneNumber: string };

export type PhoneSendOtpResponse = { message: string };

/**
 * `POST /api/auth/phone-number/verify`. Signs an existing account in; for a
 * number with no account, what happens depends on the `PhoneAuthIntent` sent in
 * the `PhoneAuthIntentHeader` request header. Any body key other than these
 * two is a 400. `code` is exactly six digits.
 */
export type PhoneVerifyRequest = { phoneNumber: string; code: string };

/**
 * Request header on `POST /api/auth/phone-number/verify` naming the screen the
 * driver came from. It is a header, not a body key, because the body is closed
 * to extra keys. `send-otp` ignores it. Spelled as a literal type because this
 * file declares no runtime values; the app writes the string itself.
 */
export type PhoneAuthIntentHeader = "x-phone-auth-intent";

/**
 * The values of the `PhoneAuthIntentHeader` header.
 *
 * - `sign-in` — the "Sign in" entry. A number with an account is signed in. A
 *   number with **no** account is refused with `PHONE_ACCOUNT_NOT_FOUND` (404)
 *   and nothing is created; offer the "Sign up" entry.
 * - `sign-up` — the "Sign up" entry. A number with no account gets a new
 *   `DRIVER` account. A number that already has one is simply signed in to it.
 *
 * A missing header, or any other value, is treated as `sign-in`: the server
 * never creates an account unless `sign-up` is stated.
 *
 * `PHONE_ACCOUNT_NOT_FOUND` is only ever returned for a **correct** code, and
 * that code is spent by the refusal. To continue as a sign-up, call `send-otp`
 * again and verify the new code with `sign-up`; re-sending the old code
 * answers as "no code was sent" below.
 */
export type PhoneAuthIntent = "sign-in" | "sign-up";

/** The signed-in user as the verify endpoint returns it. */
export type PhoneAuthUser = {
  id: string;
  /** The phone number until the driver's profile supplies a real name. */
  name: string;
  /** A placeholder on the `.invalid` TLD for a phone account — never show it. */
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  /** Always `DRIVER` for an account created by phone verification. */
  role: "CLIENT" | "DRIVER" | "COMPANY" | "ADMIN";
  mustChangePassword: boolean;
  isSuspended: boolean;
  /** E.164, e.g. `+995555123456`. */
  phoneNumber: string;
  phoneNumberVerified: boolean;
};

/**
 * The session itself arrives as a `Set-Cookie` header, which
 * `@better-auth/expo`'s client stores and replays; `token` is the same session
 * token for reference.
 */
export type PhoneVerifyResponse = {
  status: true;
  token: string;
  user: PhoneAuthUser;
};

/**
 * Why a phone sign-in request was refused.
 *
 * - `INVALID_REQUEST` (400) — body is not exactly the documented keys, or
 *   `code` is not six digits.
 * - `INVALID_PHONE_NUMBER` (400) — not a phone number.
 * - `INVALID_OTP` (400) — wrong code. On a backend running in development
 *   test mode (the fixed `DEV_PHONE_OTP_CODE`) this is also the answer to every
 *   case the next three codes describe — that mode never returns them — so
 *   treat an `INVALID_OTP` there as "wrong code, or send a new one".
 * - `OTP_NOT_FOUND` (400) — no code is pending for this number: none was sent,
 *   or it was already used (including by a refused sign-in). Send a new one.
 *   Real-SMS mode only.
 * - `OTP_EXPIRED` (400) — codes last five minutes. Send a new one. Real-SMS
 *   mode only.
 * - `TOO_MANY_ATTEMPTS` (403) — three wrong guesses; the code is void. Send a
 *   new one. Real-SMS mode only.
 * - `PHONE_ACCOUNT_NOT_FOUND` (404) — the code was right, the intent was
 *   `sign-in` (or absent) and the number has no account. Nothing was created
 *   and the code is spent. `message` is localised. See `PhoneAuthIntent`.
 * - `ACCOUNT_SUSPENDED` (403) — the code was right but the account is
 *   suspended; no session is issued.
 * - `SIGN_UP_HOST_NOT_ALLOWED` (403) — the number has no account and this
 *   hostname may not create driver accounts. The app is pointed at the wrong
 *   host: use the merchant host.
 * - `RATE_LIMITED` (429) — too many sends or attempts for this number or
 *   caller. Better Auth's own limiter also answers 429, with a `message` and an
 *   `X-Retry-After` header but **no `code`** — branch on the status.
 * - `SMS_NOT_CONFIGURED` (503) — the backend has no SMS provider and is not in
 *   development test mode. Nothing the user can do.
 */
export type PhoneAuthErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_PHONE_NUMBER"
  | "INVALID_OTP"
  | "OTP_NOT_FOUND"
  | "OTP_EXPIRED"
  | "TOO_MANY_ATTEMPTS"
  | "PHONE_ACCOUNT_NOT_FOUND"
  | "ACCOUNT_SUSPENDED"
  | "SIGN_UP_HOST_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "SMS_NOT_CONFIGURED";

/**
 * The body of every refusal from the two phone sign-in endpoints. `message` is
 * English except for `PHONE_ACCOUNT_NOT_FOUND` and `SIGN_UP_HOST_NOT_ALLOWED`,
 * which follow the request's `NEXT_LOCALE` cookie (Georgian by default).
 */
export type PhoneAuthErrorResponse = {
  message: string;
  code: PhoneAuthErrorCode;
};

/* ------------------------------------------------------------------------- */
/* Pushed load offers — /api/dashboard/hub/offers                            */
/* ------------------------------------------------------------------------- */

/**
 * Where an offer stands, as the server sees it right now.
 *
 * - `LIVE` — answerable: the deadline is ahead and the load is still open.
 * - `ACCEPTED` — this driver accepted it and holds the job.
 * - `DECLINED` — this driver declined it.
 * - `EXPIRED` — the deadline passed unanswered ("Offer expired. You stay
 *   online.").
 * - `WITHDRAWN` — the load was taken by someone else while the offer was live.
 *
 * Every state but `LIVE` is final. A driver is never offered the same load
 * twice; it stays on the load board for as long as it is open.
 */
export type HubOfferState =
  "LIVE" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN";

/** The driver's vehicle the load fits — the offer's fit confirmation. */
export type HubOfferVehicle = {
  /** Send this as `vehicleId` when accepting. */
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  /** The vehicle's class label, e.g. "Cargo Van". */
  typeLabel: string;
};

/**
 * One live offer: everything the offer screen shows. Carries the driver's own
 * payout and never a client-side price; carries no stop contacts — those
 * arrive with the job sheet once the job is the driver's.
 */
export type HubOffer = {
  id: string;
  /** The load on offer. After accepting, this is the job's id. */
  orderId: string;
  /** The order's human reference ("GE-48210"). */
  reference: string;
  createdAt: string;
  /**
   * When the offer stops being answerable. Authoritative, but compare it with
   * the response's `serverTime`, not the device clock — or just count down
   * from `secondsRemaining`.
   */
  expiresAt: string;
  /** Whole seconds left at `serverTime`. Start the countdown from this. */
  secondsRemaining: number;
  /** The full length of the countdown (30), for the ring's proportion. */
  lifetimeSeconds: number;
  /** What the job pays this driver. */
  driverPayout: number;
  /** The route's length, pickup to drop-off. */
  distanceKm: number;
  /** How far the driver is from the pickup; null when either is unknown. */
  pickupDistanceKm: number | null;
  pickupAddress: string;
  pickupCity: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffCity: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  scheduledAt: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  cargoCategory: string; // CargoCategory
  description: string | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  bodyType: string | null; // ChassisType
  handlingTags: string[]; // CargoHandlingTag[]
  helperCount: number;
  serviceLevel: string; // ServiceLevel
  /**
   * The vehicle the server matched this load to. Null only if that vehicle
   * was removed after the offer was made; accept then needs another of the
   * driver's vehicles.
   */
  fitVehicle: HubOfferVehicle | null;
};

/**
 * `GET /api/dashboard/hub/offers/current` — the driver's live offer, or null.
 *
 * This is the polling channel: call it while online and in the foreground, and
 * when a push arrives. It is one cheap read. An offer that has expired or been
 * withdrawn is never returned — ask `GET /api/dashboard/hub/offers/[id]` what
 * became of one.
 */
export type HubCurrentOfferResponse = {
  /** The server's clock when it answered. */
  serverTime: string;
  offer: HubOffer | null;
};

/**
 * `GET /api/dashboard/hub/offers/[id]` and `POST …/decline` — what became of
 * one of this driver's offers.
 */
export type HubOfferStateResponse = {
  serverTime: string;
  id: string;
  state: HubOfferState;
  /** The job to open — set only when `state` is `ACCEPTED`. */
  jobId: string | null;
};

/** `POST /api/dashboard/hub/offers/[id]/accept`. */
export type HubOfferAcceptRequest = {
  /** One of the driver's own vehicles — normally `offer.fitVehicle.id`. */
  vehicleId: string;
};

/**
 * The offer was accepted and the job is the driver's: open
 * `GET /api/dashboard/hub/jobs/[jobId]`. Repeating an accept that already
 * succeeded answers this again.
 */
export type HubOfferAcceptResponse = {
  offerId: string;
  jobId: string;
};

/**
 * Why an offer route refused. On top of `HubApiErrorCode` (`NOT_FOUND` is not
 * used here):
 *
 * - `OFFER_NOT_FOUND` (404) — no such offer, **or it is another driver's**.
 * - `OFFER_EXPIRED` (409) — accept only: the deadline has passed.
 * - `OFFER_DECLINED` (409) — accept only: this driver already declined it.
 * - `OFFER_ACCEPTED` (409) — decline only: this driver already accepted it.
 * - `ALREADY_CLAIMED` (409) — accept only: someone else took the load first.
 *   Carries `reference`.
 * - `INVALID_REQUEST` (400) — the body is not `{ vehicleId }`.
 *
 * Accept runs the same claim as `POST /api/orders/[id]/accept`, so its
 * refusals can come back too, with that route's statuses:
 * `NOT_ACTIVATED` (403), `DRIVER_OFFLINE` (403), `VEHICLE_NOT_FOUND` (404),
 * `VEHICLE_BELOW_BOOKED_CLASS` (400), `VEHICLE_BODY_MISMATCH` (400) and
 * `VEHICLE_TOO_SMALL` (400). The offer stays live after any of these — fix the
 * cause and accept again while the countdown runs.
 */
export type HubOfferErrorCode =
  | HubApiErrorCode
  | "OFFER_NOT_FOUND"
  | "OFFER_EXPIRED"
  | "OFFER_DECLINED"
  | "OFFER_ACCEPTED"
  | "ALREADY_CLAIMED"
  | "INVALID_REQUEST"
  | "NOT_ACTIVATED"
  | "DRIVER_OFFLINE"
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_BELOW_BOOKED_CLASS"
  | "VEHICLE_BODY_MISMATCH"
  | "VEHICLE_TOO_SMALL";

export type HubOfferErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: HubOfferErrorCode;
  /** The load's human reference — with `ALREADY_CLAIMED` only. */
  reference?: string;
};

/* ------------------------------------------------------------------------- */
/* Push device tokens — /api/dashboard/hub/push-tokens                       */
/* ------------------------------------------------------------------------- */

/**
 * The `data` object of the push sent when an offer is created. The
 * notification's title and body are generic and localised; **nothing about the
 * load is in the push**. Fetch `GET /api/dashboard/hub/offers/current`.
 */
export type LoadOfferPushData = {
  type: "LOAD_OFFER";
  offerId: string;
};

/**
 * `POST /api/dashboard/hub/push-tokens` — register this device, or refresh it.
 * Call on every launch once signed in: it is an upsert on the token.
 *
 * The token is tied to the session that registers it and is removed when that
 * session ends, so signing out stops pushes to the device; calling `DELETE`
 * first is good manners, not a requirement.
 */
export type PushTokenRegisterRequest = {
  /** From `getExpoPushTokenAsync()`: `ExponentPushToken[…]`. */
  token: string;
  /** `Platform.OS`. */
  platform: "ios" | "android";
  /**
   * The language pushes to this device are written in. Optional; defaults to
   * the request's locale (`NEXT_LOCALE` cookie, else ka).
   */
  locale?: "en" | "ka";
};

export type PushTokenRegisterResponse = { registered: true };

/** `DELETE /api/dashboard/hub/push-tokens` — forget this device. */
export type PushTokenUnregisterRequest = { token: string };

/** `removed` is false when the token was not registered to this account. */
export type PushTokenUnregisterResponse = { removed: boolean };

/**
 * - `INVALID_REQUEST` (400) — the body is not a JSON object.
 * - `INVALID_TOKEN` (400) — `token` is not an Expo push token.
 * - `INVALID_PLATFORM` (400) — `platform` is not `ios` or `android`.
 */
export type PushTokenErrorCode =
  HubApiErrorCode | "INVALID_REQUEST" | "INVALID_TOKEN" | "INVALID_PLATFORM";

export type PushTokenErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: PushTokenErrorCode;
};

/* ------------------------------------------------------------------------- */
/* Driver wallet — /api/dashboard/hub/wallet…                                */
/* ------------------------------------------------------------------------- */

/*
 * The wallet of an **independent** driver: a balance built from an append-only
 * ledger, withdrawals to a verified bank account, and those accounts.
 *
 * What the app must know before drawing the Earnings screen:
 *
 * - **Every amount is integer tetri** (`amountTetri: 9265` is ₾92.65), signed
 *   on ledger entries: positive adds to the balance, negative takes from it.
 *   The currency is always GEL.
 * - **Today the balance is zero for everyone.** A job credits the wallet only
 *   once a payment gateway has confirmed the client's payment, and no gateway
 *   is integrated. Cash jobs never credit. The copy "Payouts land here when a
 *   delivery is confirmed" must not promise a credit per completed job.
 * - **A roster driver has no wallet**: every route here answers 403
 *   `WALLET_NOT_AVAILABLE`. Hide the wallet for `persona: "ROSTER"`. Per-job
 *   payouts on `GET /api/dashboard/hub/jobs` are unaffected and stay visible
 *   to every driver.
 * - **Withdrawals are paid by hand.** There is no arrival time to promise and
 *   no fee. The design's "Arrives within one business day" is not a commitment
 *   the server makes.
 * - **Bank accounts are verified by staff**, not by a ₾0.01 transfer. The
 *   design's "We send ₾0.01 to the account" copy describes nothing that
 *   happens.
 * - A ledger entry references its job by `reference` only — never the client's
 *   price or the platform's cut.
 */

/** The five banks, in the design's order. */
export type WalletBank =
  "TBC" | "BANK_OF_GEORGIA" | "LIBERTY" | "PROCREDIT" | "BASISBANK";

/**
 * - `PENDING` — waiting for staff to verify it ("Verifying").
 * - `VERIFIED` — may receive withdrawals and be the default.
 * - `REJECTED` — refused; `rejectionReason` says why. Remove it and add again.
 */
export type WalletBankAccountStatus = "PENDING" | "VERIFIED" | "REJECTED";

export type WalletBankAccount = {
  id: string;
  bank: WalletBank;
  /** The bank's trading name, untranslated: "TBC Bank". */
  bankName: string;
  /** The driver's own IBAN in full: 22 characters, no spaces. */
  iban: string;
  /** The design's mask: "GE29 TB•• •••• •••• 4417". */
  maskedIban: string;
  /** The driver's legal name from their profile. Not editable. */
  accountHolderName: string;
  status: WalletBankAccountStatus;
  /** Staff's reason, verbatim; set only when `status` is `REJECTED`. */
  rejectionReason: string | null;
  /** At most one account is the default, and it is always `VERIFIED`. */
  isDefault: boolean;
  /** ISO 8601. */
  createdAt: string;
};

/**
 * Why `canWithdraw` is false:
 *
 * - `WALLET_FROZEN` — the account is suspended.
 * - `NO_VERIFIED_BANK_ACCOUNT` — add an account, or wait for verification.
 * - `BELOW_MINIMUM` — less than `minimumWithdrawalTetri` is available.
 */
export type WalletWithdrawBlockedReason =
  "WALLET_FROZEN" | "NO_VERIFIED_BANK_ACCOUNT" | "BELOW_MINIMUM";

/** `GET /api/dashboard/hub/wallet`. */
export type WalletSummaryResponse = {
  currency: "GEL";
  /** The sum of every ledger entry. */
  balanceTetri: number;
  /** `balanceTetri` minus pending withdrawals — the design's "Available to withdraw". */
  availableTetri: number;
  /** Requested and not yet paid or rejected. */
  pendingWithdrawalsTetri: number;
  pendingWithdrawalCount: number;
  /** The smallest amount a withdrawal may be for. */
  minimumWithdrawalTetri: number;
  /** How many bank accounts a driver may hold at once. */
  bankAccountLimit: number;
  /** Whether a withdrawal of `availableTetri` would be accepted right now. */
  canWithdraw: boolean;
  withdrawBlockedReason: WalletWithdrawBlockedReason | null;
  defaultBankAccount: WalletBankAccount | null;
};

/**
 * - `JOB_PAYOUT` (+) — a completed job's payout; `job` is set.
 * - `JOB_OVERTIME` (+) — the same job's waiting-time overtime; `job` is set.
 * - `WITHDRAWAL` (−) — a withdrawal that was paid; `withdrawal` is set.
 * - `WITHDRAWAL_REVERSAL` (+) — a paid withdrawal the bank returned;
 *   `withdrawal` is set.
 * - `ADJUSTMENT` (±) — a manual correction by staff; `note` says why.
 */
export type WalletEntryType =
  | "JOB_PAYOUT"
  | "JOB_OVERTIME"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL"
  | "ADJUSTMENT";

export type WalletEntry = {
  id: string;
  type: WalletEntryType;
  /** Signed: positive adds to the balance, negative takes from it. */
  amountTetri: number;
  /** ISO 8601 — when it was added to the balance. */
  createdAt: string;
  /** The job, for the two job types: open it with `GET …/hub/jobs/[id]`. */
  job: { id: string; reference: string } | null;
  /** The withdrawal, for the two withdrawal types. */
  withdrawal: {
    id: string;
    bank: WalletBank;
    bankName: string;
    maskedIban: string;
  } | null;
  /** Staff's reason for an `ADJUSTMENT`, verbatim; otherwise null. */
  note: string | null;
};

/**
 * `GET /api/dashboard/hub/wallet/activity?cursor=&limit=` — the ledger, newest
 * first. `limit` defaults to 20 and is capped at 50. Pass `nextCursor` back as
 * `cursor` for the next page; `null` means there is none.
 */
export type WalletActivityResponse = {
  entries: WalletEntry[];
  nextCursor: string | null;
};

/**
 * - `PENDING` — requested; the amount is reserved.
 * - `PAID` — staff transferred it; `bankReference` is the bank's reference.
 * - `REJECTED` — refused; the amount is available again. See `rejectionReason`.
 * - `REVERSED` — it was paid but the bank returned it; the amount is back in
 *   the balance.
 */
export type WalletWithdrawalStatus =
  "PENDING" | "PAID" | "REJECTED" | "REVERSED";

export type WalletWithdrawal = {
  id: string;
  /** Always positive. */
  amountTetri: number;
  status: WalletWithdrawalStatus;
  bankAccountId: string;
  bank: WalletBank;
  bankName: string;
  maskedIban: string;
  bankReference: string | null;
  rejectionReason: string | null;
  /** ISO 8601. */
  requestedAt: string;
  /** ISO 8601 — when it was paid or rejected. */
  decidedAt: string | null;
};

/**
 * `GET /api/dashboard/hub/wallet/withdrawals?cursor=&limit=` — newest first,
 * paged like the activity list.
 */
export type WalletWithdrawalsResponse = {
  withdrawals: WalletWithdrawal[];
  nextCursor: string | null;
};

/**
 * `POST /api/dashboard/hub/wallet/withdrawals` — 201 with the new withdrawal.
 */
export type WalletWithdrawalRequest = {
  /** A whole number of tetri, at least `minimumWithdrawalTetri`. */
  amountTetri: number;
  /** One of the driver's `VERIFIED` accounts; omitted or null = the default. */
  bankAccountId?: string | null;
  /**
   * **Required**, 1–100 characters: a value the app generates once per tap
   * (a UUID) and re-sends unchanged when it retries. Re-sending the same key —
   * after a timeout, or a double tap — answers 200 with the first withdrawal
   * instead of reserving twice. A request without one is 400
   * `INVALID_REQUEST`: with no key the server cannot tell a retry from a
   * second withdrawal, and would reserve the amount twice.
   */
  requestKey: string;
};

/** 201 when created; 200 when `requestKey` matched an earlier request. */
export type WalletWithdrawalResponse = {
  withdrawal: WalletWithdrawal;
  /** The wallet after the reservation. */
  balanceTetri: number;
  availableTetri: number;
};

/** `GET /api/dashboard/hub/wallet/bank-accounts` — oldest first. */
export type WalletBankAccountsResponse = {
  accounts: WalletBankAccount[];
  /** The name every account must be in; null when the profile has none yet. */
  accountHolderName: string | null;
  /** How many accounts a driver may hold at once. */
  limit: number;
  /** The selectable banks, in order, with the IBAN code each one's accounts carry. */
  banks: { bank: WalletBank; bankName: string; ibanCode: string }[];
};

/** `POST /api/dashboard/hub/wallet/bank-accounts` — 201 with the new account, `PENDING`. */
export type WalletBankAccountCreateRequest = {
  bank: WalletBank;
  /** Spaces and lower case are accepted and normalised. */
  iban: string;
};

export type WalletBankAccountResponse = { account: WalletBankAccount };

/**
 * `PATCH /api/dashboard/hub/wallet/bank-accounts/[id]` — make a `VERIFIED`
 * account the default. Nothing else about an account can be edited.
 * Answers with the full list, as `GET` does.
 */
export type WalletBankAccountUpdateRequest = { isDefault: true };

/**
 * `DELETE /api/dashboard/hub/wallet/bank-accounts/[id]` — remove an account.
 * Answers with the remaining list. Removing the default makes the oldest
 * other verified account the default.
 */
export type WalletBankAccountDeleteResponse = WalletBankAccountsResponse;

/**
 * Refusals of the wallet routes, beside the session guard's own:
 *
 * - `WALLET_NOT_AVAILABLE` (403) — a roster driver: there is no wallet.
 * - `WALLET_FROZEN` (403) — the account is suspended; nothing may be withdrawn.
 * - `INVALID_REQUEST` (400) — the body or a query parameter is malformed.
 * - `BELOW_MINIMUM` (400) — the amount is under the minimum withdrawal.
 * - `INSUFFICIENT_FUNDS` (409) — the amount is more than is available.
 * - `NO_VERIFIED_BANK_ACCOUNT` (409) — no account was named and there is no
 *   default.
 * - `BANK_ACCOUNT_NOT_FOUND` (404) — no such account on this driver.
 * - `BANK_ACCOUNT_NOT_VERIFIED` (409) — the account is pending or rejected.
 * - `IBAN_INVALID_FORMAT` (400) — not `GE` + 2 digits + 2 letters + 16 digits.
 * - `IBAN_CHECKSUM_INVALID` (400) — the check digits do not match: a typo.
 * - `IBAN_BANK_MISMATCH` (400) — the IBAN belongs to a different bank than
 *   the one selected; `ibanBank` names it when it is one of the five.
 * - `BANK_ACCOUNT_DUPLICATE` (409) — the driver already has this IBAN.
 * - `BANK_ACCOUNT_LIMIT_REACHED` (409) — remove an account first.
 * - `LEGAL_NAME_MISSING` (409) — the profile has no legal name to hold an
 *   account in; onboarding is incomplete.
 * - `BANK_ACCOUNT_HAS_PENDING_WITHDRAWAL` (409) — a withdrawal is on its way
 *   to the account; it cannot be removed until that is paid or rejected.
 */
export type WalletErrorCode =
  | HubApiErrorCode
  | "WALLET_NOT_AVAILABLE"
  | "WALLET_FROZEN"
  | "INVALID_REQUEST"
  | "BELOW_MINIMUM"
  | "INSUFFICIENT_FUNDS"
  | "NO_VERIFIED_BANK_ACCOUNT"
  | "BANK_ACCOUNT_NOT_FOUND"
  | "BANK_ACCOUNT_NOT_VERIFIED"
  | "IBAN_INVALID_FORMAT"
  | "IBAN_CHECKSUM_INVALID"
  | "IBAN_BANK_MISMATCH"
  | "BANK_ACCOUNT_DUPLICATE"
  | "BANK_ACCOUNT_LIMIT_REACHED"
  | "LEGAL_NAME_MISSING"
  | "BANK_ACCOUNT_HAS_PENDING_WITHDRAWAL";

export type WalletErrorResponse = {
  /** Human-readable, localised from the `NEXT_LOCALE` cookie (ka by default). */
  error: string;
  code: WalletErrorCode;
  /** With `IBAN_BANK_MISMATCH`: the bank the IBAN belongs to, if one of the five. */
  ibanBank?: WalletBank | null;
  /** With `INSUFFICIENT_FUNDS` and `BELOW_MINIMUM`: what is available now. */
  availableTetri?: number;
};
