import { NextResponse } from "next/server";
import { OrderStatus, Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Which kind of account is hiding (or un-hiding) a load from its own board.
 *
 * A discriminated union rather than `{ driverProfileId?, companyId? }` because
 * `LoadRejection` carries exactly one owner column per row — never both, never
 * neither — and a union is the only shape that makes the "exactly one" rule
 * impossible to get wrong at the call site rather than merely documented.
 */
type RejectionOwner =
  | { kind: "DRIVER"; driverProfileId: string }
  | { kind: "COMPANY"; companyId: string };

/**
 * Resolves the calling session to whichever kind of account rejects/restores
 * loads, applying the same gates `POST /api/orders/[id]/accept` and
 * `POST /api/logistics-company/orders/[id]/claim` already apply for their own
 * claim paths — a roster driver or an unactivated account has no board to
 * reject from in the first place, so it can't reject a load on it either.
 *
 * Returns a `NextResponse` directly on any failure so both handlers can just
 * `return` it, keeping the two verbs' gates identical by construction instead of
 * by copy-paste discipline.
 *
 * The two "no profile row yet" statuses are deliberately asymmetric — 404 for a
 * missing `DriverProfile`, 400 for a missing `LogisticsCompany` — because that
 * is what the two established *claim* routes already return for the same
 * conditions: `POST /api/orders/[id]/accept` answers 404 for a driver with no
 * profile, and `POST /api/logistics-company/orders/[id]/claim` answers 400 for a
 * company with no profile. This route follows its claim counterparts rather than
 * "fixing" the split, so that the two verbs a caller uses on the same load —
 * claim and reject — never disagree about the same missing row.
 *
 * `GET /api/loads` is the one board endpoint that does NOT match: it answers
 * **403** for either missing profile ("Your driver profile isn't set up yet." /
 * "Your company profile isn't set up yet."), because a listing has no resource
 * to call missing and no body to call malformed. That divergence is stated here
 * rather than papered over — a client must not assume one status covers both the
 * board and its actions.
 *
 * The driver 404 message differs from the accept route's, though. That route
 * answers `"Vehicle not found."` for a missing driver profile — deliberate
 * there, since the caller named a vehicle and the profile is how it is scoped —
 * but there is no vehicle anywhere in a reject, so this route names the thing
 * that is actually missing.
 */
async function resolveRejectionOwner(
  request: Request,
): Promise<RejectionOwner | NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // The same gate `GET /api/loads` applies before anything else, in the same
  // position, with the same 403 and the same wording. An account still on a
  // company-issued temporary password cannot see the board at all, so letting it
  // *act* on the board's loads would be a way in around that gate — and a
  // rejection is not a read: it writes a `LoadRejection` row that hides the load
  // from the real account holder's board once they do change their password, and
  // rejections are kept forever as training signal. Same wording deliberately:
  // the remedy is the change-password screen either way, and a second phrasing
  // of one condition is a second thing to keep in step.
  if (session.user.mustChangePassword) {
    return NextResponse.json(
      {
        error: "Change your temporary password before viewing the load board.",
      },
      { status: 403 },
    );
  }

  if (session.user.role === "DRIVER") {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, companyId: true, activatedAt: true },
    });

    if (!driverProfile) {
      return NextResponse.json(
        { error: "Driver profile not found." },
        { status: 404 },
      );
    }

    // A driver on a company's roster receives work through that company's
    // dispatch and never sees this board, so there is nothing on it for them to
    // hide. Same 403 and same wording as the accept route's roster gate.
    if (driverProfile.companyId !== null) {
      return NextResponse.json(
        {
          error:
            "Drivers who belong to a company receive deliveries through their company's dispatch, not by accepting directly.",
        },
        { status: 403 },
      );
    }

    // Kept distinct from the roster 403 above: the two are different problems
    // with different remedies, exactly as the accept route separates them.
    if (driverProfile.activatedAt === null) {
      return NextResponse.json(
        {
          error:
            "Your account isn't approved yet. Finish onboarding to accept deliveries.",
        },
        { status: 403 },
      );
    }

    return { kind: "DRIVER", driverProfileId: driverProfile.id };
  }

  if (session.user.role === "COMPANY") {
    const company = await prisma.logisticsCompany.findUnique({
      where: { userId: session.user.id },
      select: { id: true, activatedAt: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Complete your company profile before claiming deliveries." },
        { status: 400 },
      );
    }

    if (company.activatedAt === null) {
      return NextResponse.json(
        {
          error:
            "Your fleet is still under review. Operations must activate the company before you can claim deliveries.",
        },
        { status: 403 },
      );
    }

    return { kind: "COMPANY", companyId: company.id };
  }

  return NextResponse.json(
    { error: "Only drivers and logistics companies can use the load board." },
    { status: 403 },
  );
}

/**
 * POST /api/loads/[id]/reject — the calling account hides an open load from its
 * own board, and the rejection is recorded.
 *
 * **Rejecting a load is not cancelling it.** The client's booking is completely
 * untouched: it stays `PENDING`, still visible on and still claimable from every
 * other driver's and company's board. The only thing that changes is what this
 * one account sees, via a `LoadRejection` row that task-06's listing endpoint
 * filters on. This is the single most misunderstandable part of the feature, so
 * it is stated here rather than left to be inferred from the absence of any
 * write to `Order`.
 *
 * Rejection rows are also the raw signal a future acceptance-rate model will be
 * built from — per `requirements.md`, "Rejection data cannot be backfilled" —
 * which is why every rejection is written from day one even though nothing reads
 * these rows today beyond "did I reject this", and why rows are kept forever,
 * including after the load is claimed by somebody else.
 *
 * No request body: the order id in the path and the session-resolved owner are
 * the entire input, the same reasoning
 * `POST /api/logistics-company/orders/[id]/claim` gives for having none — there
 * is nothing else to name.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const owner = await resolveRejectionOwner(request);
  if (owner instanceof NextResponse) {
    return owner;
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, driverId: true, companyId: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Load not found." }, { status: 404 });
  }

  // "Open" is defined here exactly as `GET /api/loads` defines it for its
  // `available` bucket: `PENDING` **and** both assignment columns still null.
  // The status check alone is not the same predicate. `PENDING` is *intended* to
  // be the only status an unclaimed load ever has, but that is an invariant
  // maintained by the claim routes rather than one the database enforces, and
  // this route is the one place where the two definitions disagreeing has a
  // visible cost: a load the board never listed could be rejected, writing a
  // permanent `LoadRejection` row against a load that was never on that board.
  // Reading the assignment columns makes the two endpoints agree by construction
  // instead of by an assumption about a status column.
  //
  // Still a single positive check, so it keeps covering every other in-flight
  // and terminal state (CLAIMED, ACCEPTED, IN_TRANSIT, COMPLETED, CANCELLED,
  // INITIATED) without enumerating them, and keeps covering a status added later
  // without anyone remembering to come back here.
  const isOpen =
    order.status === OrderStatus.PENDING &&
    order.driverId === null &&
    order.companyId === null;

  if (!isOpen) {
    return NextResponse.json(
      { error: "This load is no longer open." },
      { status: 409 },
    );
  }

  try {
    await prisma.loadRejection.create({
      data:
        owner.kind === "DRIVER"
          ? { orderId: id, driverProfileId: owner.driverProfileId }
          : { orderId: id, companyId: owner.companyId },
    });
  } catch (error) {
    // A repeat reject of the same load by the same account hits the unique index
    // from task-01 (`@@unique([orderId, driverProfileId])` or
    // `@@unique([orderId, companyId])`). That's not a failure — the caller asked
    // for "this load is hidden from me" and it already is — so P2002 here is
    // success, not an error. Re-throw anything else: a different violation would
    // be a real bug this handler should not silently swallow.
    //
    // Caught rather than expressed as an `upsert` because `LoadRejection` has no
    // field a repeat reject should ever change (`createdAt` is set once and
    // there is nothing else on the row), so an upsert's `update` clause would
    // have to be `{}` — which reads to a future maintainer as a bug rather than
    // as the deliberate no-op it is.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  return NextResponse.json({ rejected: true }, { status: 200 });
}

/**
 * DELETE /api/loads/[id]/reject — "Restore to open loads": the calling account
 * un-hides a load it had previously rejected, bringing it back onto its own
 * board.
 *
 * Deleting a `LoadRejection` through this handler is the ONE exception to the
 * "rejections are kept forever" rule above, and it is an explicit, owner-driven
 * one. Nothing else in the codebase should ever remove one of these rows.
 *
 * No order-*status* check, unlike `POST`. Removing a rejection is always safe:
 * if the order has since left `PENDING`, task-06's `GET /api/loads` query
 * already won't list it whether or not a `LoadRejection` row exists, so a status
 * gate here would reject a request that has no way to do harm. Order
 * *existence* is still checked, so that a typo'd or stale id is reported as the
 * 404 it is rather than answered `{ restored: false }` — which would be
 * indistinguishable from a real order that simply wasn't rejected.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const owner = await resolveRejectionOwner(request);
  if (owner instanceof NextResponse) {
    return owner;
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Load not found." }, { status: 404 });
  }

  // Scoped to the owner's OWN column as well as the order, never by `orderId`
  // alone — deleting by order id would let any account restore a rejection some
  // other driver or company made, silently un-hiding a load on a board that is
  // not the caller's.
  const { count } = await prisma.loadRejection.deleteMany({
    where:
      owner.kind === "DRIVER"
        ? { orderId: id, driverProfileId: owner.driverProfileId }
        : { orderId: id, companyId: owner.companyId },
  });

  // Zero rows deleted is success, not a 404: restoring a load that was never
  // rejected ends in exactly the state the caller asked for (not rejected), the
  // same state a real restore ends in. `restored` reports which of the two
  // happened for a UI that wants to distinguish them.
  return NextResponse.json({ restored: count > 0 }, { status: 200 });
}
