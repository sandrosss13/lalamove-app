import "server-only";

import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { readLoadBoard, type LoadBoardError } from "@/lib/loads/board";
import {
  loadOrderPhotoViews,
  type OrderPhotoView,
} from "@/lib/order-photos/views";

/** The success body: the load's cargo photos, oldest first. */
export type LoadPhotosResponse = { photos: OrderPhotoView[] };

/**
 * GET /api/loads/[id]/photos — one load's cargo photos, each with a fresh
 * short-lived signed read URL, for the load board's drawer and mobile sheet.
 *
 * **Visibility is exactly the board's.** The caller gets photos only for a load
 * that `GET /api/loads` would hand them right now — in `available` (open and
 * eligible, or just claimed by somebody else), `mine` or `rejected` — and the
 * check is the very same `readLoadBoard` computation rather than a lighter
 * re-derivation of it. Every refusal the board answers (401, a temporary
 * password, a non-carrier role, a missing profile) is answered here with the
 * same status and wording; a load that is not on the caller's board is a 404,
 * indistinguishable from one that does not exist, so the endpoint cannot be
 * used to probe for order ids.
 *
 * Showing photos *before* the claim is a product decision: they show the
 * cargo, not the client — no name, address or phone — so they belong with the
 * cargo specification a driver weighs up before accepting, unlike the stop
 * contacts the board withholds until the claim.
 *
 * **Why a separate endpoint rather than URLs on the board.** The board is
 * polled every ten seconds and can list hundreds of loads; signing three URLs
 * per row per poll would be almost entirely wasted Storage calls for photos
 * nobody opened. The board carries `photoCount` and this endpoint signs only
 * when a detail surface actually opens. The cost is one full board computation
 * per open — the same work as a single poll tick.
 *
 * `no-store`: every URL in the body expires in minutes, so no cache may replay
 * one.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const board = await readLoadBoard(request);

  if (board.status !== 200) {
    return NextResponse.json<LoadBoardError>(board.body, {
      status: board.status,
    });
  }

  const { available, mine, rejected } = board.body;
  const load = [...available, ...mine, ...rejected].find(
    (item) => item.id === id,
  );

  if (load === undefined) {
    const t = await getRequestTranslations();

    return NextResponse.json<LoadBoardError>(
      { error: t("errors.loads.loadNotFound") },
      { status: 404 },
    );
  }

  // The board already counted them; a load without photos needs no query and
  // no Storage round trip.
  const photos = load.photoCount === 0 ? [] : await loadOrderPhotoViews(id);

  return NextResponse.json<LoadPhotosResponse>(
    { photos },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
