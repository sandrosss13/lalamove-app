import { useTranslations } from "next-intl";

import { OrderTrackingMap } from "@/components/order-tracking-map";

/** Pair a nullable lat/lng into a coordinate, or null when geocoding failed. */
export function toLatLng(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  return lat !== null && lng !== null ? { lat, lng } : null;
}

/**
 * The "Live tracking" panel — pulsing heading plus the polling driver map —
 * shared by the tracking page (`OrderTrackView`) and the client's order page
 * (`/orders/[id]`), so the two cannot drift apart.
 *
 * Rendering it is the caller's decision: each page shows it only while the
 * order is live (ACCEPTED / IN_TRANSIT with a driver), and the location
 * endpoint checks again that the reader is a party to the order on every poll.
 * The panel and heading classes are passed in so it matches whichever page it
 * sits on.
 */
export function LiveTrackingPanel({
  order,
  guestToken,
  className,
  headingClassName,
}: {
  order: {
    id: string;
    pickupLat: number | null;
    pickupLng: number | null;
    dropoffLat: number | null;
    dropoffLng: number | null;
  };
  /** The guest route's token, so the map can poll without a session. */
  guestToken?: string;
  className: string;
  headingClassName: string;
}) {
  const t = useTranslations("orderTracking.page");

  return (
    <section aria-labelledby="live-tracking-heading" className={className}>
      <h2 id="live-tracking-heading" className={headingClassName}>
        <span className="relative mr-2 inline-flex size-2.5 align-middle">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-500/60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-orange-500" />
        </span>
        {t("liveTracking")}
      </h2>
      <div className="mt-4">
        <OrderTrackingMap
          orderId={order.id}
          pickup={toLatLng(order.pickupLat, order.pickupLng)}
          dropoff={toLatLng(order.dropoffLat, order.dropoffLng)}
          guestToken={guestToken}
        />
      </div>
    </section>
  );
}
