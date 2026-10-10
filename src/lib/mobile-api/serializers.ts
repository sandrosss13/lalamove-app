/**
 * Shapes the Driver Hub's loader results into the JSON the native driver app
 * reads — `HubAccount`/`HubHeaderData`/`HubJobsData`/… in, the types of
 * `./contracts` out.
 *
 * **Every function here is an allowlist: it names each field it emits.** None
 * spreads its input. That is the safety property, in the same spirit as
 * `LOADS_SELECT` excluding client money at the query rather than stripping it
 * afterwards:
 *
 * - The web hub's `sampled` sub-objects — the header's invented notifications,
 *   each vehicle's invented odometer/insurance/running costs, the fleet
 *   cost-per-km tile — are placeholder figures the browser labels as samples
 *   (`src/lib/dashboard/hub/sample.ts`). The app has no such label, so they
 *   must not reach it. They are absent here by never being copied, and a new
 *   sampled field added to a loader stays absent without anyone remembering to
 *   strip it.
 * - A column added to a loader's result later — a client-side money figure
 *   above all — does not reach the app until somebody adds it here *and* to the
 *   contract, which is a deliberate act a reviewer sees.
 *
 * No runtime imports (types only), so `tests/mobile-api-serializers.spec.ts`
 * exercises these without a server or a database.
 */
import type { HubAccount } from "@/lib/dashboard/hub/account";
import type { HubAccountSettings } from "@/lib/dashboard/hub/account-settings";
import type { HubHeaderData } from "@/lib/dashboard/hub/header";
import type { HubJobSheet } from "@/lib/dashboard/hub/job-sheet";
import type {
  HubJob,
  HubJobsData,
  HubStopContact,
} from "@/lib/dashboard/hub/jobs";
import type { HubVehicle, HubVehiclesData } from "@/lib/dashboard/hub/vehicles";
import type { DriverOfferRecord } from "@/lib/offers/driver-offers";
import type { OrderProof } from "@/lib/orders/pod";
import type { SupportMessageRecord } from "@/lib/support/messages";
import type { VehicleDocumentHistoryEntry } from "@/lib/vehicle-documents/driver-documents";
import type { BankAccountRecord } from "@/lib/wallet/bank-accounts";
import type {
  WalletEntryRecord,
  WalletSummaryRecord,
} from "@/lib/wallet/driver-wallet";
import type { WithdrawalRecord } from "@/lib/wallet/withdrawals";
import type {
  DocumentAttentionSummary,
  VehicleDocumentSlot,
} from "@/lib/vehicle-documents/rules";
import type {
  HubAccountResponse,
  HubDocumentsAttention,
  HubJobSheetResponse,
  HubJobStopContact,
  HubJobsItem,
  HubJobsResponse,
  HubMeAccount,
  HubMeResponse,
  HubOffer,
  HubVehicleDocument,
  HubVehiclesItem,
  HubVehiclesResponse,
  OrderProofOfDelivery,
  SupportMessage,
  VehicleDocumentsResponse,
  WalletBankAccount,
  WalletEntry,
  WalletSummaryResponse,
  WalletWithdrawal,
} from "@/lib/mobile-api/contracts";

/**
 * `OrderStatus.CANCELLED`, as a literal: importing the Prisma enum would give
 * this module a runtime import, and it must stay type-only (see above). The
 * `satisfies` keeps the literal honest if the enum is ever renamed.
 */
const CANCELLED_ORDER_STATUS = "CANCELLED" satisfies HubJobSheet["status"];

function toMeAccount(account: HubAccount): HubMeAccount {
  return {
    kind: account.kind,
    persona: account.persona,
    userId: account.userId,
    displayName: account.displayName,
    initials: account.initials,
    identifier: account.identifier,
    city: account.city,
    isOnline: account.isOnline,
    isActivated: account.isActivated,
    canToggleOnline: account.canToggleOnline,
    companyName: account.companyName,
    driverProfileId: account.driverProfileId,
    companyId: account.companyId,
  };
}

/**
 * The "documents needing attention" summary, field by field. Carries no
 * storage path and no document id — it is a list of things to tell the driver,
 * and the vehicle's own documents are where the detail lives.
 */
export function toHubDocumentsAttention(
  summary: DocumentAttentionSummary,
): HubDocumentsAttention {
  return {
    expiryWarningDays: summary.expiryWarningDays,
    actionRequiredCount: summary.actionRequiredCount,
    items: summary.items.map((item) => ({
      document: item.document,
      reason: item.reason,
      vehicleId: item.vehicleId,
      plateNumber: item.plateNumber,
      expiresAt: item.expiresAt,
      daysUntilExpiry: item.daysUntilExpiry,
      flagReason: item.flagReason,
      underReview: item.underReview,
    })),
  };
}

/**
 * `GET /api/dashboard/hub/me`: the account plus the header's real half.
 *
 * `header.sampled` (the notification bell's fabricated entries and their
 * count) is dropped — there is no notification model yet, so there is nothing
 * true to send in its place.
 *
 * The header's `who` and `eta` are dropped too. Both are **English display
 * strings** composed for the web pill ("Giorgi · GE-48210", "1 h 05",
 * "Overdue"), which the web still renders and the app cannot localise. The app
 * is sent what they are made of instead — `driverName` and `deliveryDeadline`
 * — and words them itself.
 *
 * `supportPhone` is server configuration, not account data, so the route reads
 * it and hands it in; null means none is configured.
 *
 * `documentsAttention` comes from its own loader and is required rather than
 * defaulted, so a new call site cannot quietly report "nothing needs attention".
 */
export function toHubMeResponse(
  account: HubAccount,
  header: HubHeaderData,
  supportPhone: string | null,
  documentsAttention: DocumentAttentionSummary,
): HubMeResponse {
  return {
    account: toMeAccount(account),
    jobsInProgressCount: header.jobsInProgressCount,
    jobsInProgress: header.jobsInProgress.map((job) => ({
      id: job.id,
      shortId: job.shortId,
      route: job.route,
      driverName: job.driverName,
      deliveryDeadline: job.deliveryDeadline,
    })),
    supportPhone,
    documentsAttention: toHubDocumentsAttention(documentsAttention),
  };
}

/**
 * An order's proof of delivery, field by field. The URLs are short-lived
 * signed read URLs; no storage path is on the loader's type to begin with.
 */
export function toOrderProofOfDelivery(
  proof: OrderProof,
): OrderProofOfDelivery {
  return {
    photos: proof.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      takenAt: photo.takenAt,
    })),
    hasSignature: proof.hasSignature,
    signatureUrl: proof.signatureUrl,
  };
}

function toStopContact(
  contact: HubStopContact | null,
): HubJobStopContact | null {
  return contact === null
    ? null
    : { name: contact.name, phone: contact.phone, details: contact.details };
}

function toJobsItem(job: HubJob): HubJobsItem {
  return {
    id: job.id,
    shortId: job.shortId,
    reference: job.reference,
    status: job.status,
    pickupAddress: job.pickupAddress,
    dropoffAddress: job.dropoffAddress,
    distanceKm: job.distanceKm,
    fare: job.fare,
    driverPayout: job.driverPayout,
    overtimeDriverPayout: job.overtimeDriverPayout,
    helperCount: job.helperCount,
    waitingMinutes: job.waitingMinutes,
    createdAt: job.createdAt,
    scheduledAt: job.scheduledAt,
    pickupWindowStart: job.pickupWindowStart,
    pickupWindowEnd: job.pickupWindowEnd,
    deliveryDeadline: job.deliveryDeadline,
    pickupCity: job.pickupCity,
    dropoffCity: job.dropoffCity,
    inTransitAt: job.inTransitAt,
    completedAt: job.completedAt,
    vehicleTypeLabel: job.vehicleTypeLabel,
    vehiclePlate: job.vehiclePlate,
    serviceLevel: job.serviceLevel,
    bodyType: job.bodyType,
    pickupContact: toStopContact(job.pickupContact),
    dropoffContact: toStopContact(job.dropoffContact),
    purchaseOrderRef: job.purchaseOrderRef,
  };
}

/**
 * `GET /api/dashboard/hub/jobs`. The only money emitted is the carrier's own:
 * `driverPayout`, `overtimeDriverPayout` and their sum, `fare`.
 */
export function toHubJobsResponse(data: HubJobsData): HubJobsResponse {
  return {
    jobs: data.jobs.map(toJobsItem),
    counts: {
      all: data.counts.all,
      active: data.counts.active,
      completed: data.counts.completed,
      cancelled: data.counts.cancelled,
    },
  };
}

/**
 * `GET /api/dashboard/hub/jobs/[id]`. Tenancy is not decided here: the sheet
 * handed in has already passed `canViewJobSheet` inside `getHubJobSheet`.
 *
 * **A cancelled job carries no payout figure** — `driverPayout` and
 * `overtimeDriverPayout` are both null. The stored columns still hold what the
 * job was commissioned at, but a cancelled job is not going to pay it, and the
 * web sheet refuses to print it for every reader (`JobSheetCancelled` in
 * `job-sheet-screen.tsx`, `payout="none"`). Nulling it here rather than
 * trusting the app to hide it means the app cannot show what the web does not.
 *
 * **Proof of delivery goes to the assigned driver only.** `reader` is the
 * scope the route resolved (`HubJobSheetScope["kind"]`); for a `COMPANY`
 * reader `proofOfDelivery` is null, whatever the loader carried. The signed
 * URLs are bearer tokens to photographs of a client's premises and a
 * recipient's signature, and on this surface the one account with a use for
 * them is the driver who took them. Required rather than defaulted, so a new
 * call site has to say who is reading.
 */
export function toHubJobSheetResponse(
  job: HubJobSheet,
  reader: "DRIVER" | "COMPANY",
): HubJobSheetResponse {
  const isCancelled = job.status === CANCELLED_ORDER_STATUS;

  return {
    id: job.id,
    reference: job.reference,
    status: job.status,
    fleet:
      job.fleet === null
        ? null
        : {
            driverName: job.fleet.driverName,
            vehiclePlate: job.fleet.vehiclePlate,
          },
    pickupAddress: job.pickupAddress,
    pickupLat: job.pickupLat,
    pickupLng: job.pickupLng,
    pickupCity: job.pickupCity,
    pickupContactName: job.pickupContactName,
    pickupContactPhone: job.pickupContactPhone,
    pickupContactDetails: job.pickupContactDetails,
    dropoffAddress: job.dropoffAddress,
    dropoffLat: job.dropoffLat,
    dropoffLng: job.dropoffLng,
    dropoffCity: job.dropoffCity,
    dropoffContactName: job.dropoffContactName,
    dropoffContactPhone: job.dropoffContactPhone,
    dropoffContactDetails: job.dropoffContactDetails,
    distanceKm: job.distanceKm,
    cargoCategory: job.cargoCategory,
    description: job.description,
    packagingDescription: job.packagingDescription,
    itemQuantity: job.itemQuantity,
    cargoWeightKg: job.cargoWeightKg,
    cargoLengthM: job.cargoLengthM,
    cargoWidthM: job.cargoWidthM,
    cargoHeightM: job.cargoHeightM,
    handlingTags: [...job.handlingTags],
    helperCount: job.helperCount,
    bodyType: job.bodyType,
    createdAt: job.createdAt,
    scheduledAt: job.scheduledAt,
    pickupWindowStart: job.pickupWindowStart,
    pickupWindowEnd: job.pickupWindowEnd,
    deliveryDeadline: job.deliveryDeadline,
    inTransitAt: job.inTransitAt,
    completedAt: job.completedAt,
    driverPayout: isCancelled ? null : job.driverPayout,
    overtimeDriverPayout: isCancelled ? null : job.overtimeDriverPayout,
    waitingMinutes: job.waitingMinutes,
    receivedBy: job.receivedBy,
    proofOfDelivery:
      reader === "DRIVER" ? toOrderProofOfDelivery(job.proofOfDelivery) : null,
  };
}

/**
 * One vehicle document slot. The loader's rows never carry a storage path, so
 * there is none to leak; what is named here is the status, the dates and the
 * (already localised) flag reason.
 */
export function toHubVehicleDocument(
  slot: VehicleDocumentSlot,
): HubVehicleDocument {
  return {
    type: slot.type,
    state: slot.state,
    onFile:
      slot.onFile === null
        ? null
        : {
            id: slot.onFile.id,
            expiresAt: slot.onFile.expiresAt,
            daysUntilExpiry: slot.onFile.daysUntilExpiry,
            validity: slot.onFile.validity,
            approvedAt: slot.onFile.approvedAt,
          },
    submission:
      slot.submission === null
        ? null
        : {
            id: slot.submission.id,
            status: slot.submission.status,
            flagReason: slot.submission.flagReason,
            uploadedAt: slot.submission.uploadedAt,
          },
  };
}

/**
 * `GET`/`POST /api/driver-profile/vehicles/[id]/documents`: one owned
 * vehicle's documents and its upload history.
 */
export function toVehicleDocumentsResponse(
  vehicle: { vehicleId: string; plateNumber: string },
  documents: readonly VehicleDocumentSlot[],
  history: readonly VehicleDocumentHistoryEntry[],
): VehicleDocumentsResponse {
  return {
    vehicleId: vehicle.vehicleId,
    plateNumber: vehicle.plateNumber,
    documents: documents.map(toHubVehicleDocument),
    history: history.map((entry) => ({
      id: entry.id,
      type: entry.type,
      status: entry.status,
      flagReason: entry.flagReason,
      expiresAt: entry.expiresAt,
      uploadedAt: entry.uploadedAt,
      reviewedAt: entry.reviewedAt,
      supersededAt: entry.supersededAt,
    })),
  };
}

/**
 * One support message as its sender sees it. Who resolved it is staff-side
 * information and is not on the wire; nothing here implies a reply is coming.
 */
export function toSupportMessage(record: SupportMessageRecord): SupportMessage {
  return {
    id: record.id,
    topic: record.topic,
    body: record.body,
    status: record.status,
    order:
      record.order === null
        ? null
        : { id: record.order.id, reference: record.order.reference },
    createdAt: record.createdAt,
    resolvedAt: record.resolvedAt,
  };
}

function toVehiclesItem(
  vehicle: HubVehicle,
  documents: readonly VehicleDocumentSlot[] | undefined,
): HubVehiclesItem {
  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    colour: vehicle.colour,
    photoUrls: [...vehicle.photoUrls],
    vehicleClass: vehicle.vehicleClass,
    vehicleClassLabel: vehicle.vehicleClassLabel,
    vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
    vehicleTypeCode: vehicle.vehicleTypeCode,
    vehicleTypeLabel: vehicle.vehicleTypeLabel,
    category: vehicle.category,
    maxPayloadKg: vehicle.maxPayloadKg,
    declaredPayloadKg: vehicle.declaredPayloadKg,
    chassisType: vehicle.chassisType,
    cargoLengthM: vehicle.cargoLengthM,
    cargoWidthM: vehicle.cargoWidthM,
    cargoHeightM: vehicle.cargoHeightM,
    declaredCargoLengthM: vehicle.declaredCargoLengthM,
    declaredCargoWidthM: vehicle.declaredCargoWidthM,
    declaredCargoHeightM: vehicle.declaredCargoHeightM,
    loadingAccessType: vehicle.loadingAccessType,
    ownership: vehicle.ownership,
    status: vehicle.status,
    assignment:
      vehicle.assignment === null
        ? null
        : {
            driverProfileId: vehicle.assignment.driverProfileId,
            driverUserId: vehicle.assignment.driverUserId,
            driverName: vehicle.assignment.driverName,
            isOnline: vehicle.assignment.isOnline,
            assignedAt: vehicle.assignment.assignedAt,
          },
    reviewStatus: vehicle.reviewStatus,
    dispatchable: vehicle.dispatchable,
    createdAt: vehicle.createdAt,
    documents:
      documents === undefined ? null : documents.map(toHubVehicleDocument),
  };
}

/**
 * `GET /api/dashboard/hub/vehicles`.
 *
 * Two `sampled` blocks are dropped: each vehicle's (odometer, cost per km,
 * fuel, operating cities, jobs this week, insurance and inspection dates,
 * running costs — none of which has a column) and the tiles' fleet cost per km.
 * The sampled insurance date in particular must not be confused with the real
 * one, which arrives in `documents`.
 *
 * `ownedVehicleDocuments` holds the document slots of the vehicles the reader
 * **owns as a driver**, keyed by vehicle id. A vehicle absent from it — a
 * roster driver's company vehicle, any vehicle of a company account — gets
 * `documents: null`. Required, so a call site has to decide what it passes.
 */
export function toHubVehiclesResponse(
  data: HubVehiclesData,
  ownedVehicleDocuments: ReadonlyMap<string, readonly VehicleDocumentSlot[]>,
): HubVehiclesResponse {
  return {
    kind: data.kind,
    persona: data.persona,
    canAddVehicle: data.canAddVehicle,
    vehicles: data.vehicles.map((vehicle) =>
      toVehiclesItem(vehicle, ownedVehicleDocuments.get(vehicle.id)),
    ),
    tiles: {
      vehicleCount: data.tiles.vehicleCount,
      classBreakdown: data.tiles.classBreakdown.map((group) => ({
        vehicleClass: group.vehicleClass,
        label: group.label,
        count: group.count,
      })),
      onTheRoadCount: data.tiles.onTheRoadCount,
      unassignedCount: data.tiles.unassignedCount,
    },
  };
}

/**
 * `GET /api/dashboard/hub/account`.
 *
 * The loader has already truncated the company's payout IBAN to its last four
 * characters; a driver has no bank column at all, so the `DRIVER` shape carries
 * no payout field — the web's payout panel for a driver is entirely sampled.
 */
export function toHubAccountResponse(
  settings: HubAccountSettings,
): HubAccountResponse {
  if (settings.shape === "COMPANY") {
    return {
      shape: "COMPANY",
      email: settings.email,
      companyName: settings.companyName,
      vatId: settings.vatId,
      phone: settings.phone,
      city: settings.city,
      registeredAddress: settings.registeredAddress,
      contactName: settings.contactName,
      contactRole: settings.contactRole,
      contactEmail: settings.contactEmail,
      payoutIbanLast4: settings.payoutIbanLast4,
    };
  }

  return {
    shape: "DRIVER",
    email: settings.email,
    accountType: settings.accountType,
    firstName: settings.firstName,
    lastName: settings.lastName,
    companyName: settings.companyName,
    vatId: settings.vatId,
    phone: settings.phone,
    city: settings.city,
    emergencyContactName: settings.emergencyContactName,
    emergencyContactPhone: settings.emergencyContactPhone,
    idNumber: settings.idNumber,
    dateOfBirth: settings.dateOfBirth,
    licenceExpiresAt: settings.licenceExpiresAt,
    documents: settings.documents.map((document) => ({
      type: document.type,
      status: document.status,
      flagReason: document.flagReason,
    })),
  };
}

/**
 * One live offer as the offer screen reads it. Field by field, like every
 * serializer here: the driver's own payout and nothing of the client's price,
 * and no stop contacts — those come with the job sheet once the job is theirs.
 */
export function toHubOffer(record: DriverOfferRecord): HubOffer {
  return {
    id: record.id,
    orderId: record.orderId,
    reference: record.reference,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    secondsRemaining: record.secondsRemaining,
    lifetimeSeconds: record.lifetimeSeconds,
    driverPayout: record.driverPayout,
    distanceKm: record.distanceKm,
    pickupDistanceKm: record.pickupDistanceKm,
    pickupAddress: record.pickupAddress,
    pickupCity: record.pickupCity,
    pickupLat: record.pickupLat,
    pickupLng: record.pickupLng,
    dropoffAddress: record.dropoffAddress,
    dropoffCity: record.dropoffCity,
    dropoffLat: record.dropoffLat,
    dropoffLng: record.dropoffLng,
    scheduledAt: record.scheduledAt,
    pickupWindowStart: record.pickupWindowStart,
    pickupWindowEnd: record.pickupWindowEnd,
    deliveryDeadline: record.deliveryDeadline,
    cargoCategory: record.cargoCategory,
    description: record.description,
    packagingDescription: record.packagingDescription,
    itemQuantity: record.itemQuantity,
    cargoWeightKg: record.cargoWeightKg,
    cargoLengthM: record.cargoLengthM,
    cargoWidthM: record.cargoWidthM,
    cargoHeightM: record.cargoHeightM,
    bodyType: record.bodyType,
    handlingTags: [...record.handlingTags],
    helperCount: record.helperCount,
    serviceLevel: record.serviceLevel,
    fitVehicle:
      record.fitVehicle === null
        ? null
        : {
            id: record.fitVehicle.id,
            plateNumber: record.fitVehicle.plateNumber,
            make: record.fitVehicle.make,
            model: record.fitVehicle.model,
            typeLabel: record.fitVehicle.typeLabel,
          },
  };
}

/* ------------------------------------------------------------------------- */
/* Driver wallet                                                             */
/* ------------------------------------------------------------------------- */

/** One of the driver's own bank accounts. The IBAN is theirs, so it is whole. */
export function toWalletBankAccount(
  record: BankAccountRecord,
): WalletBankAccount {
  return {
    id: record.id,
    bank: record.bank,
    bankName: record.bankName,
    iban: record.iban,
    maskedIban: record.maskedIban,
    accountHolderName: record.accountHolderName,
    status: record.status,
    rejectionReason: record.rejectionReason,
    isDefault: record.isDefault,
    createdAt: record.createdAt,
  };
}

/** `GET /api/dashboard/hub/wallet`. */
export function toWalletSummaryResponse(
  record: WalletSummaryRecord,
): WalletSummaryResponse {
  return {
    currency: "GEL",
    balanceTetri: record.balanceTetri,
    availableTetri: record.availableTetri,
    pendingWithdrawalsTetri: record.pendingWithdrawalsTetri,
    pendingWithdrawalCount: record.pendingWithdrawalCount,
    minimumWithdrawalTetri: record.minimumWithdrawalTetri,
    bankAccountLimit: record.bankAccountLimit,
    canWithdraw: record.withdrawBlockedReason === null,
    withdrawBlockedReason: record.withdrawBlockedReason,
    defaultBankAccount:
      record.defaultBankAccount === null
        ? null
        : toWalletBankAccount(record.defaultBankAccount),
  };
}

/**
 * One ledger entry. The job is its id and reference and nothing else: no
 * client price, no commission — the entry's amount is the driver's own.
 */
export function toWalletEntry(record: WalletEntryRecord): WalletEntry {
  return {
    id: record.id,
    type: record.type,
    amountTetri: record.amountTetri,
    createdAt: record.createdAt,
    job:
      record.job === null
        ? null
        : { id: record.job.id, reference: record.job.reference },
    withdrawal:
      record.withdrawal === null
        ? null
        : {
            id: record.withdrawal.id,
            bank: record.withdrawal.bank,
            bankName: record.withdrawal.bankName,
            maskedIban: record.withdrawal.maskedIban,
          },
    note: record.note,
  };
}

/** One withdrawal as its driver sees it. Who decided it is staff-side. */
export function toWalletWithdrawal(record: WithdrawalRecord): WalletWithdrawal {
  return {
    id: record.id,
    amountTetri: record.amountTetri,
    status: record.status,
    bankAccountId: record.bankAccountId,
    bank: record.bank,
    bankName: record.bankName,
    maskedIban: record.maskedIban,
    bankReference: record.bankReference,
    rejectionReason: record.rejectionReason,
    requestedAt: record.requestedAt,
    decidedAt: record.decidedAt,
  };
}
