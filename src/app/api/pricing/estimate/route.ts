import { NextResponse } from "next/server";

import {
  estimateDelivery,
  parseQuoteFields,
  priceForServiceLevel,
  quoteFailureMessage,
} from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Per-IP budget for the endpoint. Pitched at how one visitor actually prices a
 * job rather than at the single quote it looks like from here: a client quotes
 * a route, then swaps the vehicle type, adds a helper or corrects an address
 * and quotes again, so one booking is a run of recalculations, not one call.
 *
 * A script still cannot burn through the LocationIQ key, because each allowed
 * call costs three LocationIQ requests — two geocode lookups plus the
 * directions call that routes between them — which caps one caller at 60
 * LocationIQ requests a minute.
 */
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/** Bucket used when no proxy header identifies the caller (e.g. local dev). */
const UNKNOWN_CALLER_KEY = "unknown-caller";

/**
 * Best-effort caller identity from proxy headers. `x-forwarded-for` may list
 * several hops, and the first entry is the original client. Behind a trusted
 * proxy this is the caller's IP; without one every caller shares a single
 * bucket, which is acceptable for a coarse abuse guard.
 */
function getCallerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstHop = forwarded?.split(",")[0]?.trim();
  if (firstHop) {
    return firstHop;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : UNKNOWN_CALLER_KEY;
}

/**
 * POST /api/pricing/estimate — quote a freight job without creating one.
 *
 * Public by design: the marketing page's calculator lets visitors price a route
 * before signing up. It is rate-limited per caller because it spends the same
 * server-side LocationIQ key as the auth-gated endpoints.
 *
 * It returns the distance, the expected driving time and the fare breakdown,
 * plus the road geometry the booking form draws on its preview map, and the
 * geocoded pickup/dropoff points themselves — the caller already knows the
 * addresses it asked about, but not the exact coordinates LocationIQ resolved
 * them to, and the booking form needs those to place its markers on the same
 * points the route and the price are actually based on (Google's Places
 * autocomplete, which is what places the marker beforehand, can resolve a long
 * street to a different point along it than LocationIQ does).
 *
 * It also returns the price at each of the three service levels, so the booking
 * form can show the tiers side by side without re-quoting per tier.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Checked before parsing or geocoding so a flood costs almost nothing.
  if (!checkRateLimit(getCallerKey(request), RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        // Derived from the window rather than written out, so what a rejected
        // caller is told to wait cannot drift away from the budget above.
        headers: { "Retry-After": String(RATE_LIMIT.windowMs / 1000) },
      },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const parsed = parseQuoteFields(rawBody as Record<string, unknown>);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await estimateDelivery(parsed.data);
  if (!result.ok) {
    // An address the geocoder cannot place is well-formed input the server
    // could not act on (422); an unknown vehicle type or an ineligible
    // cargo/vehicle pairing is bad input (400).
    const status = result.reason === "unresolved_address" ? 422 : 400;
    return NextResponse.json(
      { error: quoteFailureMessage(result) },
      { status },
    );
  }

  const { pickup, dropoff, distanceKm, durationMinutes, routePath, breakdown } =
    result.estimate;

  // The booking form shows all three service-level prices side by side, so they
  // are derived here rather than over three more round trips: the tiers are
  // arithmetic on `breakdown.price`, and only the quote itself costs geocoding.
  // `REGULAR` is the quoted fare unadjusted, and is repeated here so the caller
  // can read every tier out of one object rather than special-casing one of them.
  const serviceLevels = {
    PRIORITY: priceForServiceLevel("PRIORITY", breakdown.price),
    REGULAR: breakdown.price,
    POOLING: priceForServiceLevel("POOLING", breakdown.price),
  };

  return NextResponse.json(
    {
      pickup,
      dropoff,
      distanceKm,
      durationMinutes,
      routePath,
      ...breakdown,
      serviceLevels,
    },
    { status: 200 },
  );
}
