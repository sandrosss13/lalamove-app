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
import type {
  HubAccountResponse,
  HubJobSheetResponse,
  HubJobStopContact,
  HubJobsItem,
  HubJobsResponse,
  HubMeAccount,
  HubMeResponse,
  HubVehiclesItem,
  HubVehiclesResponse,
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
 * `GET /api/dashboard/hub/me`: the account plus the header's real half.
 *
 * `header.sampled` (the notification bell's fabricated entries and their
 * count) is dropped — there is no notification model yet, so there is nothing
 * true to send in its place.
 */
export function toHubMeResponse(
  account: HubAccount,
  header: HubHeaderData,
): HubMeResponse {
  return {
    account: toMeAccount(account),
    jobsInProgressCount: header.jobsInProgressCount,
    jobsInProgress: header.jobsInProgress.map((job) => ({
      id: job.id,
      shortId: job.shortId,
      route: job.route,
      who: job.who,
      eta: job.eta,
    })),
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
 */
export function toHubJobSheetResponse(job: HubJobSheet): HubJobSheetResponse {
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
  };
}

function toVehiclesItem(vehicle: HubVehicle): HubVehiclesItem {
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
  };
}

/**
 * `GET /api/dashboard/hub/vehicles`.
 *
 * Two `sampled` blocks are dropped: each vehicle's (odometer, cost per km,
 * fuel, operating cities, jobs this week, insurance and inspection dates,
 * running costs — none of which has a column) and the tiles' fleet cost per km.
 */
export function toHubVehiclesResponse(
  data: HubVehiclesData,
): HubVehiclesResponse {
  return {
    kind: data.kind,
    persona: data.persona,
    canAddVehicle: data.canAddVehicle,
    vehicles: data.vehicles.map(toVehiclesItem),
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
    idNumber: settings.idNumber,
    dateOfBirth: settings.dateOfBirth,
  };
}
