import { NextResponse } from "next/server";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { passwordChangeRefusal } from "@/lib/orders/action-errors";
import { claimOrderForDriver } from "@/lib/orders/driver-claim";

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 */
function parseAcceptOrderBody(
  body: unknown,
  t: RequestTranslator,
): { data: { vehicleId: string } } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const { vehicleId } = body as Record<string, unknown>;

  if (typeof vehicleId !== "string" || vehicleId.trim() === "") {
    return { error: t("common.shared.vehicleidIsRequired") };
  }

  return { data: { vehicleId: vehicleId.trim() } };
}
/**
 * POST /api/orders/[id]/accept — a driver claims a pending, unassigned order
 * with one of the vehicles they hold, recorded on the order.
 *
 * This handler is the HTTP edge only: session, password-change gate, role and
 * body. The claim itself — every precondition and the atomic compare-and-swap —
 * is `claimOrderForDriver` in `@/lib/orders/driver-claim`, which a pushed
 * offer's accept route calls too; read that function's doc comment for the
 * rules. Statuses, wording and body shapes here are exactly what this route
 * answered before the claim moved out.
 *
 * Only the two refusals a client branches on carry a `code`: `DRIVER_OFFLINE`
 * (recoverable — go online and retry) and `ALREADY_CLAIMED` (lost the race;
 * also carries the load's `reference`). The others keep their plain
 * `{ error }` shape.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  // Before the role test, as everywhere — see `passwordChangeRefusal`.
  const passwordRefusal = passwordChangeRefusal(session.user, t);
  if (passwordRefusal) {
    return passwordRefusal;
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: t("errors.ordersAccept.onlyDriversCanAcceptDeliveries") },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseAcceptOrderBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { vehicleId } = parsed.data;
  const { id } = await params;

  const result = await claimOrderForDriver(
    { userId: session.user.id, orderId: id, vehicleId },
    t,
  );

  if (result.ok) {
    return NextResponse.json(result.order, { status: 200 });
  }

  if (result.reason === "ALREADY_CLAIMED") {
    return NextResponse.json(
      {
        error: result.error,
        code: "ALREADY_CLAIMED",
        reference: result.reference,
      },
      { status: result.status },
    );
  }

  if (result.reason === "DRIVER_OFFLINE") {
    return NextResponse.json(
      { error: result.error, code: "DRIVER_OFFLINE" },
      { status: result.status },
    );
  }

  return NextResponse.json({ error: result.error }, { status: result.status });
}
