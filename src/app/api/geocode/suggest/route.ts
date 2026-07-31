import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { suggestAddresses } from "@/lib/geo";

/**
 * GET /api/geocode/suggest?q=... — proxy address autocomplete for the booking
 * form. Auth-gated because it spends a server-side LocationIQ API key; a blank
 * query is the natural "not typed enough yet" state, so it returns an empty
 * list rather than a 400.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  const suggestions = await suggestAddresses(query);
  return NextResponse.json({ suggestions }, { status: 200 });
}
