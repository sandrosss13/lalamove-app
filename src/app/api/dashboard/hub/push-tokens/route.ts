import { NextResponse } from "next/server";

import {
  getRequestLocale,
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { isAppLocale, toContentLocale } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { hubApiDenialFor } from "@/lib/mobile-api/access";
import type {
  HubApiErrorResponse,
  PushTokenErrorCode,
  PushTokenErrorResponse,
  PushTokenRegisterResponse,
  PushTokenUnregisterResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiError, hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { prisma } from "@/lib/prisma";
import {
  isExpoPushToken,
  MAX_DEVICE_TOKENS_PER_USER,
  parseDevicePlatform,
} from "@/lib/push/rules";

export const dynamic = "force-dynamic";

type PushTokenRefusal = PushTokenErrorResponse | HubApiErrorResponse;

function pushTokenError(
  message: string,
  code: PushTokenErrorCode,
  status: number,
): NextResponse<PushTokenErrorResponse> {
  return NextResponse.json<PushTokenErrorResponse>(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Who is registering, and under which session. The hub's own denials
 * (`hubApiDenialFor`), read here rather than through `requireHubApiAccount`
 * because a token is tied to the *session* row, which that guard does not
 * return — and no hub account needs loading to store a token.
 */
async function resolveDevice(
  request: Request,
  t: RequestTranslator,
): Promise<
  | { userId: string; sessionId: string }
  | { response: NextResponse<HubApiErrorResponse> }
> {
  const session = await auth.api.getSession({ headers: request.headers });
  const denial = hubApiDenialFor(session?.user);

  if (denial !== null) {
    return { response: hubApiError(t, denial.code, denial.status) };
  }

  if (!session) {
    return { response: hubApiError(t, "UNAUTHENTICATED", 401) };
  }

  return { userId: session.user.id, sessionId: session.session.id };
}

/** The request body as a plain object, or the refusal for one that is not. */
async function readBody(
  request: Request,
  t: RequestTranslator,
): Promise<
  | { fields: Record<string, unknown> }
  | { response: NextResponse<PushTokenErrorResponse> }
> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return {
      response: pushTokenError(
        t("common.shared.requestBodyMustBeValidJson"),
        "INVALID_REQUEST",
        400,
      ),
    };
  }

  if (
    typeof rawBody !== "object" ||
    rawBody === null ||
    Array.isArray(rawBody)
  ) {
    return {
      response: pushTokenError(
        t("common.shared.requestBodyMustBeAJson"),
        "INVALID_REQUEST",
        400,
      ),
    };
  }

  return { fields: rawBody as Record<string, unknown> };
}

/**
 * POST /api/dashboard/hub/push-tokens — register this device for push, or
 * refresh its registration. Body: `{ token, platform, locale? }`.
 *
 * An upsert on the token, which is unique: registering again moves it to the
 * calling account and session and stamps `lastSeenAt`, so a phone handed from
 * one driver to another stops receiving the first one's pushes the moment the
 * second signs in.
 *
 * The row is deleted with its session (a foreign-key cascade), so sign-out
 * removes it without the app having to remember to.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<PushTokenRegisterResponse | PushTokenRefusal>> {
  const t = await getRequestTranslations();

  const device = await resolveDevice(request, t);
  if ("response" in device) {
    return device.response;
  }

  const body = await readBody(request, t);
  if ("response" in body) {
    return body.response;
  }

  const { token, platform: rawPlatform, locale: rawLocale } = body.fields;

  if (!isExpoPushToken(token)) {
    return pushTokenError(
      t("errors.pushTokens.tokenMustBeAnExpoPushToken"),
      "INVALID_TOKEN",
      400,
    );
  }

  const platform = parseDevicePlatform(rawPlatform);
  if (platform === null) {
    return pushTokenError(
      t("errors.pushTokens.platformMustBeIosOrAndroid"),
      "INVALID_PLATFORM",
      400,
    );
  }

  // An unrecognised `locale` is not worth refusing a registration over; the
  // request's own locale is the fallback.
  const locale = toContentLocale(
    isAppLocale(rawLocale) ? rawLocale : await getRequestLocale(),
  );

  const { userId, sessionId } = device;
  const now = new Date();

  await prisma.deviceToken.upsert({
    where: { token },
    create: { token, userId, sessionId, platform, locale, lastSeenAt: now },
    update: { userId, sessionId, platform, locale, lastSeenAt: now },
  });

  // Bound what one account can accumulate: beyond the cap, the devices not
  // seen for longest go.
  const stale = await prisma.deviceToken.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    skip: MAX_DEVICE_TOKENS_PER_USER,
    select: { id: true },
  });

  if (stale.length > 0) {
    await prisma.deviceToken.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
  }

  return hubApiOk<PushTokenRegisterResponse>({ registered: true });
}

/**
 * DELETE /api/dashboard/hub/push-tokens — forget this device. Body:
 * `{ token }`.
 *
 * Scoped to the caller's own tokens: naming somebody else's removes nothing
 * and says so (`removed: false`) rather than confirming the token exists.
 */
export async function DELETE(
  request: Request,
): Promise<NextResponse<PushTokenUnregisterResponse | PushTokenRefusal>> {
  const t = await getRequestTranslations();

  const device = await resolveDevice(request, t);
  if ("response" in device) {
    return device.response;
  }

  const body = await readBody(request, t);
  if ("response" in body) {
    return body.response;
  }

  const { token } = body.fields;

  if (!isExpoPushToken(token)) {
    return pushTokenError(
      t("errors.pushTokens.tokenMustBeAnExpoPushToken"),
      "INVALID_TOKEN",
      400,
    );
  }

  const { count } = await prisma.deviceToken.deleteMany({
    where: { token, userId: device.userId },
  });

  return hubApiOk<PushTokenUnregisterResponse>({ removed: count > 0 });
}
