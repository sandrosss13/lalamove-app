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
  /** "<driver> · <reference>" for a `BUSINESS` account; null for a driver. */
  who: string | null;
  /**
   * Time left to the delivery deadline as a ready-made **English** label
   * ("42 min", "1 h 05", "Overdue"), or null when the order has no deadline.
   */
  eta: string | null;
};

export type HubMeResponse = {
  account: HubMeAccount;
  /** How many of this account's orders are `ACCEPTED` or `IN_TRANSIT`. */
  jobsInProgressCount: number;
  /** A preview: at most 1 for a driver, at most 3 for a company. */
  jobsInProgress: HubMeJobInProgress[];
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
  /** The last six characters of `id`, upper-cased. */
  shortId: string;
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
  /** Owned vehicles plus, for a driver, any currently assigned to them. */
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
  /** The stored city value (not a display label). */
  city: string;
  idNumber: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
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
 * `isOnline`; 404 when the driver has no profile; and 403 for **two** causes
 * the status alone cannot tell apart — not a `DRIVER`, or going online before
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
