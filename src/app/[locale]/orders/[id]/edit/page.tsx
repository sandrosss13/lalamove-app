import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localeHref } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BookingForm,
  type BookingFormInitialOrder,
} from "@/components/home/booking-form";
import { stopContactFromOrder } from "@/components/home/stop-contact";
import { orderIsEditableByClient } from "@/components/orders-format";
import {
  CheckoutNotice,
  CheckoutOrderNotFoundNotice,
} from "../../../checkout/checkout-shell";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The `Order` columns the booking form is re-opened from — exactly the inputs
 * it collects, and nothing it would only be carrying.
 *
 * No price, fare component or adjustment: the form re-quotes the order live
 * and `PATCH /api/orders/[id]` re-prices it on save, so a stored figure here
 * would only be a number for the form to disagree with. A `select` for the
 * reason every client order page gives (`CHECKOUT_ORDER_SELECT`).
 */
const EDIT_ORDER_SELECT = {
  id: true,
  reference: true,
  status: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  pickupBuildingName: true,
  pickupEntrance: true,
  pickupComment: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  dropoffBuildingName: true,
  dropoffEntrance: true,
  dropoffComment: true,
  cargoCategory: true,
  bodyType: true,
  helperCount: true,
  // Pricing model v1: helpers, floor and cargo elevator at each end, plus the
  // tariff version — null on a pre-v1 order, which tells the form to read the
  // legacy `helperCount` instead (`locationHelpFromOrder`).
  pickupHelpers: true,
  pickupFloor: true,
  pickupCargoElevator: true,
  pickupPassengerElevator: true,
  dropoffHelpers: true,
  dropoffFloor: true,
  dropoffCargoElevator: true,
  dropoffPassengerElevator: true,
  tariffVersion: true,
  serviceLevel: true,
  description: true,
  // The form picks a vehicle by its stable code, never by row id.
  vehicleTypeSpec: { select: { code: true } },
  // Goods-first booking: the item lines the order was booked with, so the
  // form re-opens on the same list (`linesFromOrderItems`). The catalogue
  // entry's code and `active` flag decide whether a catalogue line is re-listed
  // by code or carried as a custom line with its snapshot figures. Ordered by
  // id (a cuid, so close to creation order) to keep the order stable.
  items: {
    orderBy: { id: "asc" },
    select: {
      kind: true,
      label: true,
      quantity: true,
      unitWeightKg: true,
      lengthM: true,
      widthM: true,
      heightM: true,
      palletType: true,
      catalogEntry: { select: { code: true, active: true } },
    },
  },
} as const;

/** A stored coordinate pair, or `null` when either half is missing. */
function toLatLng(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  return lat !== null && lng !== null ? { lat, lng } : null;
}

/**
 * `/orders/[id]/edit` — the booking form, re-opened on an unpaid order.
 *
 * Only an `INITIATED` order can be edited (see `orderIsEditableByClient`): it
 * is the one state no driver or company can see, so changing it under them is
 * impossible. Any other status is sent back to `/orders/[id]`, which shows the
 * order read-only — the same "the moment has passed, here is the order" move
 * checkout makes for a paid order. `PATCH /api/orders/[id]` enforces the rule
 * again on save.
 *
 * The page itself is only the gates and the load; the form does the rest,
 * including the save and the hand-off to `/checkout/[id]`. Gates are
 * `/checkout/[id]`'s, line for line.
 */
export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations("orders.orderDetail");
  const tShared = await getTranslations("common.shared");

  if (!session) {
    return (
      <CheckoutNotice title={t("editOrder")}>
        <p className="mt-3 text-[14px] text-muted">
          {t("signInToViewThisOrder")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            {tShared("signIn")}
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
          >
            {tShared("signUp")}
          </Link>
        </div>
      </CheckoutNotice>
    );
  }

  if (session.user.role !== "CLIENT") {
    redirect(await localeHref("/dashboard"));
  }

  const { id } = await params;

  // Scoped to the caller: "not yours" and "not found" must be one answer.
  const [order, clientProfile] = await Promise.all([
    prisma.order.findFirst({
      where: { id, clientId: session.user.id },
      select: EDIT_ORDER_SELECT,
    }),
    // Read here so the form's vehicle list is right on its first render — see
    // `BookingFormInitialOrder.accountType`.
    prisma.clientProfile.findUnique({
      where: { userId: session.user.id },
      select: { accountType: true },
    }),
  ]);

  if (!order) {
    return <CheckoutOrderNotFoundNotice />;
  }

  if (!orderIsEditableByClient(order)) {
    redirect(await localeHref(`/orders/${order.id}`));
  }

  const isBusiness = clientProfile?.accountType === "BUSINESS";

  const initialOrder: BookingFormInitialOrder = {
    id: order.id,
    reference: order.reference,
    scheduledAt: order.scheduledAt?.toISOString() ?? null,
    pickupAddress: order.pickupAddress,
    pickupLocation: toLatLng(order.pickupLat, order.pickupLng),
    dropoffAddress: order.dropoffAddress,
    dropoffLocation: toLatLng(order.dropoffLat, order.dropoffLng),
    pickupContact: stopContactFromOrder({
      name: order.pickupContactName,
      phone: order.pickupContactPhone,
      buildingName: order.pickupBuildingName,
      entrance: order.pickupEntrance,
      comment: order.pickupComment,
      details: order.pickupContactDetails,
    }),
    dropoffContact: stopContactFromOrder({
      name: order.dropoffContactName,
      phone: order.dropoffContactPhone,
      buildingName: order.dropoffBuildingName,
      entrance: order.dropoffEntrance,
      comment: order.dropoffComment,
      details: order.dropoffContactDetails,
    }),
    cargoCategory: order.cargoCategory,
    vehicleTypeCode: order.vehicleTypeSpec.code,
    bodyType: order.bodyType,
    helperCount: order.helperCount,
    pickupHelpers: order.pickupHelpers,
    pickupFloor: order.pickupFloor,
    pickupCargoElevator: order.pickupCargoElevator,
    pickupPassengerElevator: order.pickupPassengerElevator,
    dropoffHelpers: order.dropoffHelpers,
    dropoffFloor: order.dropoffFloor,
    dropoffCargoElevator: order.dropoffCargoElevator,
    dropoffPassengerElevator: order.dropoffPassengerElevator,
    tariffVersion: order.tariffVersion,
    serviceLevel: order.serviceLevel,
    description: order.description,
    items: order.items.map((item) => ({
      kind: item.kind,
      catalogueCode:
        item.catalogEntry !== null && item.catalogEntry.active
          ? item.catalogEntry.code
          : null,
      label: item.label,
      quantity: item.quantity,
      unitWeightKg: item.unitWeightKg,
      lengthM: item.lengthM,
      widthM: item.widthM,
      heightM: item.heightM,
      palletType: item.palletType,
    })),
    // Anything but an explicit BUSINESS is the narrower list, as in the hook.
    accountType: isBusiness ? "BUSINESS" : "INDIVIDUAL",
  };

  return <BookingForm initialOrder={initialOrder} />;
}
