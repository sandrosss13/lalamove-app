/**
 * The server half of the client order emails: load the order, decide whether
 * and to whom (`./build`), translate, render (`./render`), send. Called from
 * the routes where an order's state has just changed — and committed:
 *
 * | kind            | fired from                                                       |
 * | --------------- | ---------------------------------------------------------------- |
 * | ORDER_CONFIRMED | `POST /api/orders/[id]/pay`, when `settleOrderPayment` made the move |
 * | DRIVER_ASSIGNED | `claimOrderForDriver` (driver accept, hub offer accept) and      |
 * |                 | `POST /api/logistics-company/orders/[id]/dispatch`               |
 * | ORDER_DELIVERED | `POST /api/orders/[id]/complete`                                 |
 * | ORDER_CANCELLED | `POST /api/orders/[id]/cancel` (CLIENT) and                      |
 * |                 | `POST /api/logistics-company/orders/[id]/cancel` (CARRIER)       |
 *
 * **Never throws into the caller and never holds its response**: the work runs
 * after the response (`runAfterResponse`), and every failure — a missing
 * order, no address, Resend refusing — is a log line naming the order id,
 * never the address. Resend's idempotency key (`order-email/{kind}/{orderId}`)
 * drops a repeat of the same kind for the same order for 24 hours.
 *
 * Everything heavy (Prisma, the catalogs, the renderer) is imported on call,
 * so a module importing this one (`driver-claim.ts`) loads no more than it did.
 */

import type { AppLocale } from "@/i18n/routing";
import type { OrderEmailKind } from "@/lib/email/order-emails/types";
import { runAfterResponse } from "@/lib/email/run-after-response";

export type SendOrderEmailOptions = {
  /** ORDER_CANCELLED only: who cancelled. Defaults to CARRIER. */
  cancelledBy?: "CLIENT" | "CARRIER";
  /**
   * ORDER_CONFIRMED for a guest only: the raw guest token from the pay
   * request (`readGuestOrderToken`) — the only moment it exists — which
   * becomes the email's `/track/{token}` link. Ignored for every other case.
   */
  guestToken?: string | null;
  /**
   * The requester's locale, used only when the order has none stored (an
   * unpaid order the client cancels). Read it before calling — this module
   * does no request-scoped reads after the response.
   */
  requestLocale?: AppLocale | null;
};

/** Read by `./send`'s single query — every column `OrderEmailSource` names. */
const ORDER_EMAIL_SELECT = {
  id: true,
  reference: true,
  locale: true,
  clientId: true,
  client: {
    select: {
      email: true,
      deactivatedAt: true,
      clientProfile: { select: { firstName: true } },
    },
  },
  guestEmail: true,
  guestFirstName: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupFloor: true,
  pickupPassengerElevator: true,
  pickupCargoElevator: true,
  dropoffAddress: true,
  dropoffFloor: true,
  dropoffPassengerElevator: true,
  dropoffCargoElevator: true,
  helperCount: true,
  items: { select: { label: true, quantity: true }, orderBy: { id: "asc" } },
  paymentMethodType: true,
  payment: { select: { status: true } },
  price: true,
  serviceLevelAdjustment: true,
  overtimeFee: true,
  helperOvertimeFee: true,
  completedAt: true,
  receivedBy: true,
  vehicle: { select: { make: true, model: true, plateNumber: true } },
  vehicleTypeSpec: { select: { code: true, label: true } },
  company: { select: { companyName: true } },
  driverClaimCompanyId: true,
} as const;

const LOG = "[order-email]";

/**
 * Queue one client email about `orderId`. Resolves once it is queued (or, with
 * no request scope, once it is done); never rejects.
 */
export async function sendOrderEmail(
  orderId: string,
  kind: OrderEmailKind,
  options: SendOrderEmailOptions = {},
): Promise<void> {
  try {
    await runAfterResponse(
      () => deliverOrderEmail(orderId, kind, options),
      `${LOG} ${kind} for order ${orderId} not delivered:`,
    );
  } catch (error) {
    // `runAfterResponse` already catches `work`; this guards the scheduling.
    console.error(`${LOG} ${kind} for order ${orderId} not queued:`, error);
  }
}

async function deliverOrderEmail(
  orderId: string,
  kind: OrderEmailKind,
  options: SendOrderEmailOptions,
): Promise<void> {
  const [
    { prisma },
    build,
    { getEmailDelivery, getEmailReplyTo, getEmailSender },
    { canDeliverEmail },
  ] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/email/order-emails/build"),
    import("@/lib/email/sender"),
    import("@/lib/email/delivery"),
  ]);

  const skip = (reason: string) =>
    console.warn(`${LOG} no ${kind} email for order ${orderId}: ${reason}`);

  if (!canDeliverEmail(getEmailDelivery())) {
    skip("EMAIL_UNCONFIGURED");
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: ORDER_EMAIL_SELECT,
  });

  if (!order) {
    skip("ORDER_NOT_FOUND");
    return;
  }

  const recipient = build.orderEmailRecipient(order);

  if (!recipient.ok) {
    skip(recipient.reason);
    return;
  }

  const locale = build.orderEmailLocale(order.locale, options.requestLocale);

  // Only DRIVER_ASSIGNED names a company. A company claim sets `companyId`; a
  // roster driver's own claim leaves it null and records the company in
  // `driverClaimCompanyId` instead.
  let companyName = order.company?.companyName ?? null;
  if (
    kind === "DRIVER_ASSIGNED" &&
    companyName === null &&
    order.driverClaimCompanyId
  ) {
    const rosterCompany = await prisma.logisticsCompany.findUnique({
      where: { id: order.driverClaimCompanyId },
      select: { companyName: true },
    });
    companyName = rosterCompany?.companyName ?? null;
  }

  const [
    { createTranslator },
    { loadMessages },
    { vehicleTypeSpecLabel },
    { getClientSupportPhone },
    { clientOrigin },
    { renderOrderEmail },
  ] = await Promise.all([
    import("next-intl"),
    import("@/i18n/messages"),
    import("@/lib/vehicle-type-spec-labels"),
    import("@/lib/support-contact"),
    import("@/lib/host"),
    import("@/lib/email/order-emails/render"),
  ]);
  const messages = await loadMessages(locale);
  type Translator = import("@/i18n/translator").Translator;
  // `loadMessages` returns the catalog untyped; see `passwordResetEmailCopy`.
  const rootT = createTranslator({ locale, messages }) as unknown as Translator;
  const emailT = createTranslator({
    locale,
    messages,
    namespace: "orderEmails",
  }) as unknown as Translator;

  const origin = clientOrigin();
  const replyTo = getEmailReplyTo();
  const data = build.buildOrderEmailData({
    kind,
    source: order,
    recipient,
    locale,
    links: build.orderEmailLinks({
      origin,
      locale,
      orderId,
      kind,
      isGuest: recipient.isGuest,
      guestToken: options.guestToken,
    }),
    supportPhone: getClientSupportPhone(),
    replyTo,
    vehicleLabel: order.vehicleTypeSpec
      ? vehicleTypeSpecLabel(
          order.vehicleTypeSpec.code,
          order.vehicleTypeSpec.label,
          rootT,
        )
      : null,
    companyName,
    cancelledBy: options.cancelledBy,
  });

  if (!data) {
    skip("MISSING_DATA");
    return;
  }

  const rendered = renderOrderEmail(data, emailT, {
    logoUrl: `${origin}/zomo-logo.png`,
  });
  const message = build.orderEmailMessage({
    to: recipient.to,
    rendered,
    kind,
    orderId,
    replyTo,
  });

  const sender = getEmailSender();

  if (sender) {
    await sender.send(message);
    return;
  }

  // DEV_CONSOLE (the gate above has ruled out UNCONFIGURED): development only.
  console.warn(
    [
      "[email:dev] RESEND_API_KEY is not set — this email was NOT sent.",
      `  to:      ${message.to}`,
      `  subject: ${message.subject}`,
      `  kind:    ${kind} (order ${orderId})`,
    ].join("\n"),
  );
}
