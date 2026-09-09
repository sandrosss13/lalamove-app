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
 * `reference` and `driverPayout` are included. `reference` is the human-readable
 * `GE-48210` handle every party needs in order to talk about the job at all.
 * `driverPayout` is the driver's commissioned 85% share.
 *
 * **This constant answers the CLIENT, and only the client.** It carries the full
 * itemised fare — `baseFare`, `distanceFare`, `timeFare`, `helperFee`,
 * `overtimeFee`, `price` and `serviceLevelAdjustment` — because the client who
 * booked the order is commercially party to every one of those figures and is
 * entitled to see the quote they agreed to. Whoever *carries* the job is not:
 * see `CARRIER_ORDER_PARTY_SELECT` below, which is the shape every carrier-facing
 * response uses instead.
 *
 * An earlier revision of this comment asked each call site to remember to render
 * `driverPayout` rather than `price` off this one list. That instruction is
 * withdrawn: a rule a reader has to remember at every call site is a rule that
 * rots, and it did — the six lifecycle endpoints below all answer a carrier, and
 * two of them had grown ad-hoc `price: false` overrides that still handed back
 * every fare component `price` can be re-added from. Splitting the shape in two
 * replaces the instruction with a type.
 *
 * As of that split, **no route in this codebase imports `ORDER_PARTY_SELECT`
 * any more** — all six lifecycle endpoints it was written for (accept, start,
 * complete, claim, dispatch, cancel) now use `CARRIER_ORDER_PARTY_SELECT`. It is
 * kept rather than deleted because it is the correct shape for any future
 * genuinely client-facing single-order endpoint, and "nothing imports it today"
 * is not on its own a reason to delete a documented export. If you are reaching
 * for it, be certain the response you are building is read by the client who
 * booked the order.
 *
 * `commissionRate` is deliberately absent and must stay absent: it is an
 * internal figure, and no party to a job has business with the rate — only with
 * the resolved payout it produced.
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
  reference: true,
  driverPayout: true,
} as const;

/**
 * The `Order` columns an endpoint may return to the *carrier* on an order —
 * whichever account is fulfilling it, an independent driver or a logistics
 * company — never to the client.
 *
 * *"Driver should see only its net, not total paid."* `Order.price` and
 * `Order.overtimeFee` are what the CLIENT pays; `Order.driverPayout` and
 * `Order.overtimeDriverPayout` are what the carrier earns. Only the second pair
 * may cross this boundary.
 *
 * **Why a separate object rather than `ORDER_PARTY_SELECT` with fields removed
 * at each call site.** The removal-at-the-call-site version was tried and
 * failed in exactly the way this list prevents: two routes spread
 * `ORDER_PARTY_SELECT` and set `price: false`, which reads as a redaction and is
 * not one. `price` is `baseFare + distanceFare + timeFare + helperFee` floored
 * at the pricing rule's `minimumFare` (`src/lib/pricing.ts`), so a response that
 * drops `price` while keeping its four components hands the client's total to
 * anyone willing to add up. All seven money columns have to leave together or
 * none of them does, which is a property of a *shape*, not of a call site.
 *
 * **Omission, not nulling — and the difference is the point.** The stop-contact
 * redaction two functions' worth of code away (`canSeeStopContacts`, in both
 * listing routes) selects the six contact columns and then nulls them per row,
 * because contact entitlement genuinely varies row by row within one response:
 * an open order the requester has not claimed sits in the same array as one
 * already assigned to them. Money entitlement does not vary that way. There is
 * no row in a carrier's response that may carry the client's price, so there is
 * nothing to keep a stable shape *for*, and the stronger mechanism is available:
 * a field that was never asked for is absent from the type Prisma infers, so a
 * future `order.price` in carrier-facing code is a compile error rather than a
 * runtime `null` that `formatGel` would quietly render as `₾0.00` — or that
 * someone would "fix" by re-adding the column, undoing the redaction on the way
 * past. Nulling keeps the key present with a value somebody has to remember not
 * to render; this list makes the leak unrepresentable.
 *
 * **A logistics company is a carrier, not a client, and gets the same shape for
 * the same reason.** There is no separate company revenue model in this codebase
 * — a `BUSINESS` account renders its revenue through the very same
 * `src/lib/dashboard/hub/earnings.ts` an individual driver does, merely scoped
 * by `companyId` instead of `driverId`. The platform takes its cut of what the
 * client paid and pays the rest to whoever fulfils the job, company or
 * individual alike, so a company's own revenue is its commissioned payout. It
 * has no more claim on the client's gross quote than a driver does, for the same
 * reason a subcontractor does not get to see what the general contractor billed.
 * `ORDER_PARTY_SELECT`'s original comment already grouped accept/start/complete
 * with claim/dispatch/cancel as "the same audience on the same terms"; that
 * grouping was right all along — the audience is *the carrier* — and this
 * constant is what finally matches it.
 *
 * `driverPayout` is the carrier's share of the client's quoted total,
 * `overtimeDriverPayout` their share of `overtimeFee`. Both are resolved and
 * stored when they become known (booking and completion respectively) rather
 * than computed on read, so retuning the commission never rewrites what a
 * historical job paid — see `src/lib/orders/payout.ts` and the columns' own
 * comments on `model Order`. Together they are the only money a carrier-facing
 * response may ever carry, and `totalDriverEarnings` is how they are summed.
 *
 * `commissionRate` stays absent for the same reason it is absent above: it is an
 * internal figure, and no party has business with the rate — only with the
 * resolved payout it produced.
 *
 * Kept as a flat, hand-listed literal rather than a spread of the constant
 * above. A derived shape would silently inherit any money column added to
 * `ORDER_PARTY_SELECT` later, which is precisely the failure mode this whole
 * file exists to prevent; a flat list means a new column joins a carrier
 * response only when someone types it here on purpose.
 */
export const CARRIER_ORDER_PARTY_SELECT = {
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
  serviceLevel: true,
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
  reference: true,
  driverPayout: true,
  overtimeDriverPayout: true,
} as const;
