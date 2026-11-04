/**
 * The four client order emails as a pure function: `OrderEmailData` and a
 * translator scoped to the `orderEmails` namespace in, `{ subject, html, text }`
 * out. No Prisma, no env, no `next/*` — `send.ts` does the loading and the
 * deciding, and `tests/order-emails-render.spec.ts` pins the output.
 *
 * Copy lives in `src/messages/{en,ka}/orderEmails.json`; the layout (header,
 * chip, blocks, footer, escaping) in `@/lib/email/layout`. Every optional value
 * whose data is null or empty drops its whole line rather than rendering a
 * blank or the word "null".
 */

import type { Translator } from "@/i18n/translator";
import {
  emailTextPlain,
  renderEmailLayout,
  type EmailBlock,
  type EmailChipTone,
  type EmailRow,
  type EmailStop,
  type EmailText,
} from "@/lib/email/layout";

import type {
  DriverAssignedData,
  OrderCancelledData,
  OrderConfirmedData,
  OrderDeliveredData,
  OrderEmailBase,
  OrderEmailData,
  OrderEmailKind,
  OrderEmailStop,
  RenderedOrderEmail,
} from "./types";

export type RenderOrderEmailOptions = {
  /** Absolute URL of the PNG logo, e.g. `${clientOrigin()}/zomo-logo.png`. */
  logoUrl: string;
};

/** Every date and time in these emails is Tbilisi wall-clock time. */
const TIME_ZONE = "Asia/Tbilisi";

/** How many item lines the confirmation lists before "+N more". */
const MAX_ITEMS_LISTED = 20;

/**
 * `185` → `₾185.00`. The same rendering as the client order screens'
 * `formatGel` (`@/components/orders-format`), repeated rather than imported:
 * that module pulls in `next-intl`'s React hooks, and the money format is a
 * per-surface helper by the app's convention (see its header).
 */
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}

function intlLocale(locale: OrderEmailBase["locale"]): string {
  return locale === "ka" ? "ka-GE" : "en-GB";
}

/** "Thu, 6 November" / "ხუთ, 6 ნოემბერი". */
function formatDate(date: Date, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${part("weekday")}, ${part("day")} ${part("month")}`;
}

/** "10:00". */
function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).format(date);
}

function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

const KIND_KEY: Record<OrderEmailKind, string> = {
  ORDER_CONFIRMED: "confirmed",
  DRIVER_ASSIGNED: "driverAssigned",
  ORDER_DELIVERED: "delivered",
  ORDER_CANCELLED: "cancelled",
};

const KIND_TONE: Record<OrderEmailKind, EmailChipTone> = {
  ORDER_CONFIRMED: "orange",
  DRIVER_ASSIGNED: "blue",
  ORDER_DELIVERED: "green",
  ORDER_CANCELLED: "grey",
};

function pickupWindowBlock(
  data: OrderEmailBase,
  t: Translator,
  locale: string,
): EmailBlock | null {
  const start = data.pickupWindowStart;
  if (!start) {
    return null;
  }

  const date = formatDate(start, locale);
  const end = data.pickupWindowEnd;

  if (end && end.getTime() !== start.getTime()) {
    return {
      kind: "panel",
      label: t("details.pickupWindow"),
      value: t("details.window", {
        date,
        start: formatTime(start, locale),
        end: formatTime(end, locale),
      }),
    };
  }

  return {
    kind: "panel",
    label: t("details.pickupTime"),
    value: t("details.exact", { date, time: formatTime(start, locale) }),
  };
}

/** "3rd floor · Passenger elevator", or null when there is nothing to say. */
function stopDetail(stop: OrderEmailStop, t: Translator): string | null {
  const parts: string[] = [];

  if (stop.floor !== null && Number.isFinite(stop.floor)) {
    parts.push(t("details.floor", { floor: stop.floor }));
  }

  if (stop.passengerElevator && stop.cargoElevator) {
    parts.push(t("details.bothElevators"));
  } else if (stop.passengerElevator) {
    parts.push(t("details.passengerElevator"));
  } else if (stop.cargoElevator) {
    parts.push(t("details.cargoElevator"));
  } else if (stop.floor !== null && stop.floor > 0) {
    // Above the ground floor, "no elevator" is what the driver plans around.
    parts.push(t("details.noElevator"));
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function routeBlock(
  data: OrderEmailBase,
  t: Translator,
  { details, compact }: { details: boolean; compact: boolean },
): EmailBlock {
  const stops: EmailStop[] = [];

  for (const [label, stop] of [
    [t("details.from"), data.pickup],
    [t("details.to"), data.dropoff],
  ] as const) {
    if (present(stop.address)) {
      stops.push({
        label,
        address: stop.address,
        detail: details ? stopDetail(stop, t) : null,
      });
    }
  }

  return { kind: "route", stops, compact };
}

/** One line per item with its quantity; null when no item has a label. */
function itemsBlock(
  items: OrderConfirmedData["items"],
  t: Translator,
): EmailBlock | null {
  const listed = items.filter((item) => present(item.label));
  if (listed.length === 0) {
    return null;
  }

  const lines: { label: string; quantity: string; muted?: boolean }[] = listed
    .slice(0, MAX_ITEMS_LISTED)
    .map((item) => ({
      label: item.label.trim(),
      quantity: t("details.quantityValue", { quantity: item.quantity }),
    }));
  const rest = listed.length - lines.length;
  if (rest > 0) {
    lines.push({
      label: t("details.moreItems", { count: rest }),
      quantity: "",
      muted: true,
    });
  }

  return {
    kind: "items",
    title: t("details.items"),
    itemHeader: t("details.itemHeader"),
    quantityHeader: t("details.quantityHeader"),
    items: lines,
  };
}

function paymentSummary(
  data: OrderConfirmedData,
  t: Translator,
): string | null {
  switch (data.paymentMethod) {
    case "CARD":
      return data.paid
        ? t("details.paymentPaid", { method: t("details.paymentCard") })
        : t("details.paymentCard");
    case "BANK_TRANSFER":
      return data.paid
        ? t("details.paymentPaid", {
            method: t("details.paymentBankTransfer"),
          })
        : t("details.paymentBankTransfer");
    case "CASH":
      return t("details.paymentPayLater");
    case null:
      return null;
  }
}

/**
 * A "get in touch" sentence in the variant the data allows: `{key}.replyOrPhone`,
 * `{key}.reply` (only when `canReply` — `EMAIL_FROM` is a no-reply address, so
 * the copy may invite a reply only when `EMAIL_REPLY_TO` is set) or
 * `{key}.phone`; null when there is neither, and the caller drops the line.
 */
function contactLine(
  t: Translator,
  key: string,
  data: Pick<OrderEmailBase, "canReply" | "supportPhone">,
): EmailText | null {
  const phone = present(data.supportPhone) ? data.supportPhone.trim() : null;

  if (data.canReply) {
    return phone
      ? { text: t(`${key}.replyOrPhone`, { phone }), phone }
      : t(`${key}.reply`);
  }

  return phone ? { text: t(`${key}.phone`, { phone }), phone } : null;
}

function mutedParagraph(text: EmailText | null): EmailBlock | null {
  return text === null ? null : { kind: "paragraph", tone: "muted", text };
}

function confirmedBlocks(
  data: OrderConfirmedData,
  t: Translator,
  locale: string,
): EmailBlock[] {
  const rows: EmailRow[] = [];

  if (present(data.vehicleLabel)) {
    rows.push({ label: t("details.vehicle"), value: data.vehicleLabel });
  }
  if (data.helperCount > 0) {
    rows.push({
      label: t("details.helpers"),
      value: t("details.helperCount", { count: data.helperCount }),
    });
  }
  const payment = paymentSummary(data, t);
  if (payment) {
    rows.push({ label: t("details.payment"), value: payment });
  }
  rows.push({
    label: t("details.total"),
    value: formatGel(data.totalGel),
    strong: true,
  });

  return compact([
    { kind: "paragraph", text: t("confirmed.intro") },
    pickupWindowBlock(data, t, locale),
    routeBlock(data, t, { details: true, compact: false }),
    itemsBlock(data.items, t),
    { kind: "rows", rows },
    data.links.track
      ? { kind: "button", label: t("confirmed.track"), href: data.links.track }
      : null,
    data.links.order
      ? {
          kind: "link",
          lead: t("confirmed.changeLead"),
          label: t("confirmed.changeLink"),
          href: data.links.order,
        }
      : null,
    { kind: "note", text: t("confirmed.note") },
  ]);
}

function driverAssignedBlocks(
  data: DriverAssignedData,
  t: Translator,
  locale: string,
): EmailBlock[] {
  const makeModel = [data.vehicle.make, data.vehicle.model]
    .filter(present)
    .map((part) => part.trim())
    .join(" ");

  return compact([
    {
      kind: "paragraph",
      text: present(data.companyName)
        ? t("driverAssigned.introWithCompany", {
            company: data.companyName.trim(),
          })
        : t("driverAssigned.intro"),
    },
    {
      kind: "vehicle",
      label: present(data.vehicleLabel) ? data.vehicleLabel : null,
      title: makeModel || null,
      plate: present(data.vehicle.plate) ? data.vehicle.plate.trim() : null,
      plateLabel: t("details.plate"),
    },
    pickupWindowBlock(data, t, locale),
    routeBlock(data, t, { details: false, compact: true }),
    data.links.track
      ? {
          kind: "button",
          label: t("driverAssigned.track"),
          href: data.links.track,
        }
      : data.isGuest
        ? { kind: "paragraph", text: t("driverAssigned.guestTrackingHint") }
        : null,
    { kind: "note", text: t("driverAssigned.safety") },
  ]);
}

function deliveredBlocks(
  data: OrderDeliveredData,
  t: Translator,
  locale: string,
): EmailBlock[] {
  const date = formatDate(data.completedAt, locale);
  const time = formatTime(data.completedAt, locale);
  const intro = present(data.dropoff.address)
    ? t("delivered.intro", { address: data.dropoff.address, date, time })
    : null;
  const signed = present(data.receivedBy)
    ? t("delivered.signedBy", { name: data.receivedBy.trim() })
    : null;
  const introText = [intro, signed].filter(present).join(" ");

  const rows: EmailRow[] = [];
  if (data.overtimeGel > 0) {
    rows.push({
      label: t("details.overtime"),
      value: formatGel(data.overtimeGel),
    });
  }
  rows.push({
    label: t("details.total"),
    value: formatGel(data.totalGel),
    strong: true,
  });

  return compact([
    introText ? { kind: "paragraph", text: introText } : null,
    data.links.track
      ? {
          kind: "link",
          lead: t("delivered.proof"),
          label: t("delivered.proofLink"),
          href: data.links.track,
        }
      : data.isGuest
        ? { kind: "paragraph", text: t("delivered.proofGuest") }
        : null,
    { kind: "rows", rows },
    data.links.receipt
      ? {
          kind: "link",
          lead: null,
          label: t("delivered.receipt"),
          href: data.links.receipt,
        }
      : null,
    {
      kind: "button",
      label: t("delivered.bookAgain"),
      href: data.links.bookAgain,
    },
    mutedParagraph(contactLine(t, "delivered.damaged", data)),
  ]);
}

function cancelledBlocks(
  data: OrderCancelledData,
  t: Translator,
  locale: string,
): EmailBlock[] {
  const date = data.pickupWindowStart
    ? formatDate(data.pickupWindowStart, locale)
    : null;
  const introKey =
    data.cancelledBy === "CARRIER"
      ? "cancelled.introCarrier"
      : "cancelled.introClient";

  return compact([
    {
      kind: "paragraph",
      text: date ? t(introKey, { date }) : t(`${introKey}NoDate`),
    },
    pickupWindowBlock(data, t, locale),
    routeBlock(data, t, { details: false, compact: true }),
    data.wasPaid ? { kind: "note", text: t("cancelled.refund") } : null,
    {
      kind: "button",
      label: t("cancelled.bookAgain"),
      href: data.links.bookAgain,
    },
    data.cancelledBy === "CLIENT"
      ? mutedParagraph(contactLine(t, "cancelled.notYou", data))
      : null,
  ]);
}

function compact(blocks: (EmailBlock | null)[]): EmailBlock[] {
  return blocks.filter((block): block is EmailBlock => block !== null);
}

function heading(data: OrderEmailData, t: Translator): string {
  if (data.kind === "ORDER_CONFIRMED" && present(data.firstName)) {
    return t("confirmed.headingWithName", { name: data.firstName.trim() });
  }

  return t(`${KIND_KEY[data.kind]}.heading`);
}

function blocks(
  data: OrderEmailData,
  t: Translator,
  locale: string,
): EmailBlock[] {
  switch (data.kind) {
    case "ORDER_CONFIRMED":
      return confirmedBlocks(data, t, locale);
    case "DRIVER_ASSIGNED":
      return driverAssignedBlocks(data, t, locale);
    case "ORDER_DELIVERED":
      return deliveredBlocks(data, t, locale);
    case "ORDER_CANCELLED":
      return cancelledBlocks(data, t, locale);
  }
}

/** The site link in the footer: the origin of `bookAgain`, labelled zomo.ge. */
function siteOrigin(bookAgain: string): string | null {
  try {
    return new URL(bookAgain).origin;
  } catch {
    return null;
  }
}

/**
 * Renders one order email. `t` must be scoped to the `orderEmails` namespace
 * (`createTranslator({ locale, messages, namespace: "orderEmails" })`) in
 * `data.locale`.
 */
export function renderOrderEmail(
  data: OrderEmailData,
  t: Translator,
  { logoUrl }: RenderOrderEmailOptions,
): RenderedOrderEmail {
  const locale = intlLocale(data.locale);
  const kindKey = KIND_KEY[data.kind];
  const subject = t(`subject.${kindKey}`, { reference: data.reference });
  const body = blocks(data, t, locale);
  const firstParagraph = body.find((block) => block.kind === "paragraph");
  const origin = siteOrigin(data.links.bookAgain);

  const { html, text } = renderEmailLayout({
    lang: data.locale,
    title: subject,
    preheader:
      firstParagraph && firstParagraph.kind === "paragraph"
        ? emailTextPlain(firstParagraph.text)
        : null,
    logoUrl,
    logoAlt: t("layout.logoAlt"),
    headerRight: t("layout.orderReference", { reference: data.reference }),
    chip: { label: t(`chip.${kindKey}`), tone: KIND_TONE[data.kind] },
    heading: heading(data, t),
    blocks: body,
    // With no reply address and no phone the "Questions?" line is dropped;
    // the zomo.ge link below it remains.
    footer: [
      contactLine(t, "layout.questions", data),
      t("layout.reason"),
    ].filter((line): line is EmailText => line !== null && line !== ""),
    footerLink: origin ? { label: t("layout.website"), href: origin } : null,
  });

  return { subject, html, text };
}
