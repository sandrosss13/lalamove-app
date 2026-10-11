// Hard build-time boundary, not decoration: the board this handler serves reads
// the Better Auth session and talks to Prisma, neither of which belongs in a
// browser bundle. See `src/lib/loads/board.ts`, which carries the same import.
import "server-only";

import { NextResponse } from "next/server";

import { readLoadBoard } from "@/lib/loads/board";

// The wire contract stays importable from this path, where the rest of the
// codebase's comments point for it. Types only: a value imported from here
// into a client component would drag the session and Prisma with it.
export type {
  LoadBoardError,
  LoadBoardItem,
  LoadBoardResponse,
} from "@/lib/loads/board";

/**
 * GET /api/loads — the load board's single data source: the open client
 * bookings this account could claim, the ones it already holds, and the ones it
 * has hidden. No request body, no query parameters.
 *
 * The whole computation — session gates, activation, tenancy, rejections,
 * eligibility, and the money and contact redaction — lives in `readLoadBoard`
 * (src/lib/loads/board.ts), whose doc comment is the authority on every rule
 * this response follows. It moved there so `GET /api/loads/[id]/photos` can
 * decide "is this load on the caller's board" with the identical rule rather
 * than a second copy of it. This handler only puts the answer on the wire.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const result = await readLoadBoard(request);

  return NextResponse.json(result.body, { status: result.status });
}
