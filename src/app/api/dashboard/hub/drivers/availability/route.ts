import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import {
  getHubFleetAvailability,
  type HubFleetAvailability,
} from "@/lib/dashboard/hub/fleet-availability";

/**
 * GET /api/dashboard/hub/drivers/availability?date=YYYY-MM-DD — one day of the
 * Drivers screen's Fleet Availability board, as JSON.
 *
 * The board is server-rendered for its first day; this route exists for every
 * day after that. The design steps the date with `‹`/`›` and a `Today` button
 * and says "changing the date refetches", so the alternative would be a full
 * navigation per arrow press, which would throw away the zoom, the window and
 * the filter state the dispatcher had set up — client state the server knows
 * nothing about.
 *
 * **Scope is the session's own account, resolved server-side, and there is no
 * company or driver id in the query string.** The `companyId` clause inside
 * `getHubFleetAvailability` is the tenancy boundary — an id taken from the URL
 * would turn a board into a way to read another fleet's roster and its whole
 * day's work. The only thing read from the query string is the date, which the
 * loader itself re-validates and falls back to today on.
 *
 * A non-BUSINESS account is refused with a `403` rather than an empty board,
 * mirroring `earnings/export/route.ts`: the page-side guard `redirect()`s, and a
 * redirect is the wrong answer to a `fetch`, so the same rule is answered here
 * as a status code. That refusal is also the loader's own — `getHubDrivers()`
 * and `getHubFleetAvailability()` both return `null` for anything but a fleet
 * owner — so this endpoint and the screen above it cannot drift apart.
 */

/** The shape every failure of this route answers with. */
export type HubFleetAvailabilityError = { error: string };

/** The success shape, named so the client fetcher can type its response. */
export type HubFleetAvailabilityResponse = HubFleetAvailability;

export async function GET(request: Request): Promise<NextResponse> {
  // Read directly rather than through `requireDashboardSession()`, which
  // `redirect()`s: a fetch would follow the redirect and parse the sign-in page
  // as JSON. The two conditions below are the ones that guard would redirect
  // on, answered as status codes instead.
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json<HubFleetAvailabilityError>(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  if (session.user.mustChangePassword || session.user.role === "CLIENT") {
    return NextResponse.json<HubFleetAvailabilityError>(
      { error: "This account cannot read a fleet roster." },
      { status: 403 },
    );
  }

  const account = await resolveHubAccount();

  if (account === null) {
    return NextResponse.json<HubFleetAvailabilityError>(
      { error: "Your driver profile isn't set up yet." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const data = await getHubFleetAvailability(
    account,
    searchParams.get("date") ?? "",
  );

  // `null` is the loader's "not a fleet owner" answer, and it is the only thing
  // it means — a fleet with an empty roster returns a board with no rows, which
  // is an ordinary renderable state rather than a refusal. Answered here rather
  // than pre-empted with a `kind` check of this route's own so that the rule
  // lives in exactly one place: adding a persona to the board is then an edit to
  // the loader, not to the loader and to every caller.
  if (data === null) {
    return NextResponse.json<HubFleetAvailabilityError>(
      {
        error:
          "Driver availability is a fleet screen — only a logistics company account has a roster to lay out.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json<HubFleetAvailabilityResponse>(data, {
    headers: {
      // A board is a point-in-time snapshot of who is busy, and its bar statuses
      // were derived against the instant it was built. A cached copy would tell
      // a dispatcher that a driver who has since gone en route is still free.
      "Cache-Control": "no-store",
    },
  });
}
