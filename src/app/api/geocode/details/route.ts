import { NextResponse } from "next/server";

import { getPlaceDetails } from "@/lib/geo";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Per-IP budget for the endpoint. Unlike the suggest endpoint this fires once
 * per accepted suggestion, so a completed booking form costs two calls — pickup
 * and dropoff. The allowance covers a visitor who reconsiders an address a few
 * times while keeping the ceiling far below anything worth scripting.
 */
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

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
 * GET /api/geocode/details?placeId=... — resolve one autocomplete suggestion to
 * its structured address components and coordinates, for the booking form's
 * address fields.
 *
 * Public by design: it completes the address a visitor picked on the landing
 * page's booking form before signing up. It is rate-limited per caller because
 * it spends a server-side Google Places API key; a blank `placeId` is the
 * natural "nothing selected yet" state, so it returns null details rather than
 * a 400.
 */
export async function GET(request: Request): Promise<NextResponse> {
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

  const placeId = new URL(request.url).searchParams.get("placeId");
  if (!placeId || placeId.trim().length === 0) {
    return NextResponse.json({ details: null }, { status: 200 });
  }

  const details = await getPlaceDetails(placeId);
  return NextResponse.json({ details }, { status: 200 });
}
