/**
 * The `Order` columns an endpoint may return to a *party* to that order — the
 * client who booked it, the driver carrying it, or the company that claimed it.
 *
 * The *absence* of a select is what made these endpoints over-share: a
 * `findUnique`/`update` carrying only a `where` returns every column of `Order`,
 * so each column added to the model silently joins the response. Naming the
 * fields means a column added later cannot start leaking through these responses
 * by accident; anything new belongs here deliberately or not at all, and this
 * list must stay.
 *
 * `savedCardId` and `purchaseOrderRef` are deliberately absent and must stay
 * absent: one is the client's chosen payment instrument, the other their finance
 * team's internal reference, and no consumer of an order-dispatch surface has
 * any business with either — not even one party to the job. The six stop-contact
 * columns *are* included, because the parties to a job do need to know who to
 * ask for at each end.
 *
 * Shared by the lifecycle endpoints only, all of which answer the same audience
 * on the same terms: accept, start and complete (`/api/orders/[id]/...`), and
 * claim, dispatch and cancel (`/api/logistics-company/orders/[id]/...`). The two
 * *listing* endpoints deliberately keep their own route-local allowlists
 * instead, because they serve non-parties too — a driver or a company browsing
 * open, unassigned work — and must be free to withhold more than this.
 *
 * Relations are not selected because none of those handlers ever included any;
 * this list is the scalar row and nothing more.
 */
export const ORDER_PARTY_SELECT = {
  id: true,
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
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  baseFare: true,
  distanceFare: true,
  timeFare: true,
  helperFee: true,
  overtimeFee: true,
  price: true,
  serviceLevel: true,
  serviceLevelAdjustment: true,
  vehicleTypeSpecId: true,
  status: true,
  clientId: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentMethodType: true,
  inTransitAt: true,
  completedAt: true,
  waitingMinutes: true,
  createdAt: true,
  updatedAt: true,
} as const;
