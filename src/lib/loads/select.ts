/**
 * The `Order` columns the load board reads — kept in a module of its own, with
 * no imports, so `tests/carrier-payload-redaction.spec.ts` can pin it without
 * pulling the session and Prisma into the test process (the reason
 * `src/lib/order-response-select.ts` is import-free too). Its only consumer is
 * `readLoadBoard` in `./board.ts`.
 */

/**
 * The `Order` columns this endpoint may read, and the only ones it may return.
 * Mirrors `ORDER_LIST_SELECT` in src/app/api/orders/route.ts and
 * `COMPANY_ORDER_LIST_SELECT` in src/app/api/logistics-company/orders/route.ts
 * — a third, route-local allowlist rather than a shared one, per the reasoning
 * in src/lib/order-response-select.ts's doc comment (this endpoint serves
 * non-parties too, and must be free to withhold more than the shared
 * lifecycle-endpoint list does).
 *
 * `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`
 * and `serviceLevelAdjustment` are ALL deliberately absent. `price` is what the
 * client pays; every other field in that list is a component that sums toward
 * it. None of them may reach a driver — see the GET handler's own doc comment
 * for why this is the single most important rule in this file.
 *
 * They are absent from the *select*, not stripped from the result afterwards,
 * and that distinction is the whole safety property: a leak here would need
 * somebody to deliberately add a column to this list, rather than merely
 * forgetting to remove one downstream.
 *
 * `savedCardId`, `purchaseOrderRef` and `clientId` are absent for the same
 * reason they are absent from the other listing endpoints: no consumer of a
 * dispatch surface has business with the client's payment instrument, their
 * finance team's internal reference, or their identity.
 *
 * Relations are not selected; this list is the scalar row and nothing more —
 * with one exception that reads no relation's columns: `_count.photos`, the
 * number of cargo photos the client attached. It is a count and only a count;
 * the photos themselves (signed URLs) are served per load, on demand, by
 * `GET /api/loads/[id]/photos`, so the board's 10-second poll never signs a
 * URL.
 */
export const LOADS_SELECT = {
  id: true,
  reference: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  // The board's two city dropdowns build their options from the distinct
  // cities present in this response, so both are returned on every row —
  // as display labels, resolved through `formatCity` at the shaping step.
  pickupCity: true,
  dropoffCity: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  packagingDescription: true,
  itemQuantity: true,
  handlingTags: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  driverPayout: true,
  serviceLevel: true,
  vehicleTypeSpecId: true,
  status: true,
  driverId: true,
  companyId: true,
  vehicleId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { photos: true } },
} as const;
