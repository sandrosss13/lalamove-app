import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getPlaceDetails } from "@/lib/geo";

/**
 * GET /api/geocode/details?placeId=... — resolve one autocomplete suggestion to
 * its structured address components and coordinates, for the booking form's
 * address fields. Auth-gated because it spends a server-side Google Places API
 * key; a blank `placeId` is the natural "nothing selected yet" state, so it
 * returns null details rather than a 400.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const placeId = new URL(request.url).searchParams.get("placeId");
  if (!placeId || placeId.trim().length === 0) {
    return NextResponse.json({ details: null }, { status: 200 });
  }

  const details = await getPlaceDetails(placeId);
  return NextResponse.json({ details }, { status: 200 });
}
