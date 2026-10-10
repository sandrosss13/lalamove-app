import { NextResponse } from "next/server";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import type {
  HubApiErrorResponse,
  SupportMessageCreateResponse,
  SupportMessageErrorCode,
  SupportMessageErrorResponse,
  SupportMessagesResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk, requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import { toSupportMessage } from "@/lib/mobile-api/serializers";
import { prisma } from "@/lib/prisma";
import {
  SUPPORT_MESSAGE_SELECT,
  toSupportMessageRecord,
} from "@/lib/support/messages";
import {
  MAX_SUPPORT_MESSAGE_LENGTH,
  SUPPORT_MESSAGE_HISTORY_LIMIT,
  SUPPORT_TOPICS,
  isSupportRateLimited,
  isSupportTopic,
  parseSupportBody,
  supportRateWindowStart,
} from "@/lib/support/rules";

export const dynamic = "force-dynamic";

/** A JSON refusal in this route's one error shape. Never cached. */
function supportError(
  message: string,
  code: SupportMessageErrorCode,
  status: number,
): NextResponse<SupportMessageErrorResponse> {
  return NextResponse.json<SupportMessageErrorResponse>(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Every refusal this route answers with. The session guard's own refusals are
 * typed with the hub's wider code union, though the only codes it can produce
 * here are ones `SupportMessageErrorCode` also lists.
 */
type SupportRefusal = SupportMessageErrorResponse | HubApiErrorResponse;

/** Who is sending or reading, once the guards have passed. */
type SupportSender = { userId: string; driverProfileId: string };

/**
 * The hub's session gate plus this route's own rule: only a driver sends
 * support messages. A company account has no driver profile for a message to
 * belong to (and the Support screen is a driver-app screen), so it is refused
 * rather than given a message nobody could attribute.
 */
async function resolveSender(
  request: Request,
  t: RequestTranslator,
): Promise<
  { sender: SupportSender } | { response: NextResponse<SupportRefusal> }
> {
  const guard = await requireHubApiAccount(request, t);
  if (!guard.ok) {
    return { response: guard.response };
  }

  const { userId, driverProfileId } = guard.account;
  if (driverProfileId === null) {
    return {
      response: supportError(
        t("errors.supportMessages.onlyDriversCanContactSupport"),
        "ROLE_NOT_ALLOWED",
        403,
      ),
    };
  }

  return { sender: { userId, driverProfileId } };
}

/**
 * GET /api/dashboard/hub/support/messages — the driver's own recent messages,
 * newest first, with whether each has been resolved.
 *
 * Scoped to the session's driver profile and nothing else: the route takes no
 * id from the request.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<SupportMessagesResponse | SupportRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await resolveSender(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const rows = await prisma.supportMessage.findMany({
    where: { driverProfileId: resolved.sender.driverProfileId },
    select: SUPPORT_MESSAGE_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: SUPPORT_MESSAGE_HISTORY_LIMIT,
  });

  return hubApiOk<SupportMessagesResponse>({
    messages: rows.map((row) => toSupportMessage(toSupportMessageRecord(row))),
  });
}

/**
 * POST /api/dashboard/hub/support/messages — send a message to support.
 *
 * Body: `{ topic, body, orderId? }`. `orderId` is the design's "About job"
 * attachment and must be an order assigned to this driver — past or present,
 * since a problem is often reported after the job is done. `Order.driverId` is
 * the only record of that, so an order since reassigned to another driver is
 * no longer attachable by the first.
 *
 * The 201 body is the stored message and nothing else. **It makes no promise
 * of a reply**: the design's success line ("Support replies by SMS, usually
 * within 15 minutes") describes a channel that does not exist. Staff read the
 * message in the back office and phone the driver.
 *
 * ## Rate limit
 *
 * Five messages per ten minutes per driver (`SUPPORT_MESSAGE_RATE_LIMIT`),
 * counted from the driver's own rows in the database — so the limit is the
 * same whichever serverless instance answers, survives a cold start, and
 * applies in every environment. The sixth is 429 `RATE_LIMITED`.
 *
 * The count and the insert are one transaction under a per-driver advisory
 * lock. Without the lock two requests arriving together would both count four
 * and both insert, and a burst — the thing a rate limit exists for — is
 * exactly when requests arrive together.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<SupportMessageCreateResponse | SupportRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await resolveSender(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { sender } = resolved;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return supportError(
      t("common.shared.requestBodyMustBeValidJson"),
      "INVALID_REQUEST",
      400,
    );
  }

  if (
    typeof rawBody !== "object" ||
    rawBody === null ||
    Array.isArray(rawBody)
  ) {
    return supportError(
      t("common.shared.requestBodyMustBeAJson"),
      "INVALID_REQUEST",
      400,
    );
  }

  const fields = rawBody as Record<string, unknown>;

  const { topic } = fields;
  if (!isSupportTopic(topic)) {
    return supportError(
      t("errors.supportMessages.topicMustBeOneOf", {
        topics: SUPPORT_TOPICS.join(", "),
      }),
      "INVALID_REQUEST",
      400,
    );
  }

  const parsedBody = parseSupportBody(fields.body);
  if ("refusal" in parsedBody) {
    return supportError(
      parsedBody.refusal === "BODY_REQUIRED"
        ? t("errors.supportMessages.bodyIsRequired")
        : t("errors.supportMessages.bodyTooLong", {
            max: MAX_SUPPORT_MESSAGE_LENGTH,
          }),
      "INVALID_REQUEST",
      400,
    );
  }

  let orderId: string | null = null;
  if (fields.orderId !== undefined && fields.orderId !== null) {
    if (typeof fields.orderId !== "string" || fields.orderId.trim() === "") {
      return supportError(
        t("errors.supportMessages.orderIdMustBeAString"),
        "INVALID_REQUEST",
        400,
      );
    }

    // One query, one answer: an order that does not exist and one that is
    // somebody else's are the same 404, so order ids cannot be probed.
    const order = await prisma.order.findFirst({
      where: { id: fields.orderId.trim(), driverId: sender.userId },
      select: { id: true },
    });

    if (order === null) {
      return supportError(
        t("common.shared.orderNotFound"),
        "ORDER_NOT_FOUND",
        404,
      );
    }

    orderId = order.id;
  }

  // After validation, so a malformed request never counts, and per driver
  // rather than per address: the sender is always signed in.
  const data = {
    driverProfileId: sender.driverProfileId,
    topic,
    body: parsedBody.body,
    orderId,
  };
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    // Transaction-scoped, released at commit or rollback, and compatible with
    // transaction-mode pooling — the wallet's lock, keyed for this purpose.
    // `$executeRaw`, not `$queryRaw`: the function returns `void`.
    const lockKey = `support-message:${sender.driverProfileId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const recentCount = await tx.supportMessage.count({
      where: {
        driverProfileId: sender.driverProfileId,
        createdAt: { gt: supportRateWindowStart(now) },
      },
    });

    if (isSupportRateLimited(recentCount)) {
      return null;
    }

    return tx.supportMessage.create({ data, select: SUPPORT_MESSAGE_SELECT });
  });

  if (created === null) {
    return supportError(
      t("errors.supportMessages.tooManyMessages"),
      "RATE_LIMITED",
      429,
    );
  }

  return NextResponse.json<SupportMessageCreateResponse>(
    { message: toSupportMessage(toSupportMessageRecord(created)) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
