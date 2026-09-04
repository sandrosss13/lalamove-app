import { NextResponse } from "next/server";

import { suggestAddresses } from "@/lib/geo";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Per-IP budget for the endpoint. The booking form debounces at 300ms and only
 * queries from three characters up, so typing a full address raises a handful
 * of calls per field — a visitor filling in both pickup and dropoff, typos
 * included, stays under this. A scripted flood hits the cap in seconds.
 */
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

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
 * GET /api/geocode/suggest?q=... — proxy address autocomplete for the booking
 * form.
 *
 * Public by design: the landing page's booking form lets visitors fill in their
 * pickup and dropoff addresses before signing up. It is rate-limited per caller
 * because it spends a server-side Google Places API key; a blank query is the
 * natural "not typed enough yet" state, so it returns an empty list rather than
 * a 400.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Checked before parsing or geocoding so a flood costs almost nothing.
  if (!checkRateLimit(getCallerKey(request), RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const query = new URL(request.url).searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  const suggestions = await suggestAddresses(query);
  return NextResponse.json({ suggestions }, { status: 200 });
}
