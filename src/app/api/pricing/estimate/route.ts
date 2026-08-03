import { NextResponse } from "next/server";

import { estimateDelivery, parseQuoteFields } from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Per-IP budget for the endpoint. A visitor pricing a few routes stays well
 * under it, while a script cannot burn through the LocationIQ key — each
 * allowed call costs two geocode lookups.
 */
const RATE_LIMIT = { limit: 6, windowMs: 60_000 };

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
 * POST /api/pricing/estimate — quote a delivery without creating one.
 *
 * Public by design: the marketing page's calculator lets visitors price a route
 * before signing up. It is rate-limited per caller because it spends the same
 * server-side LocationIQ key as the auth-gated endpoints, and it returns only
 * the distance and price — never the resolved coordinates.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Checked before parsing or geocoding so a flood costs almost nothing.
  if (!checkRateLimit(getCallerKey(request), RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 },
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
    return NextResponse.json(
      { error: `Could not locate address: ${result.unresolvedAddress}` },
      { status: 422 },
    );
  }

  const { distanceKm, price } = result.estimate;

  return NextResponse.json({ distanceKm, price }, { status: 200 });
}
