import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { isBlockedAuthPath } from "@/lib/mobile-api/blocked-auth-paths";

type AuthRouteHandler = (request: Request) => Promise<Response>;

const betterAuthHandlers = toNextJsHandler(auth);

/** What Next's own implicit OPTIONS handler would have advertised. */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE";

function notFound(): Response {
  return new Response("Not Found", { status: 404 });
}

/**
 * Answers 404 for the plugin endpoints this app keeps unreachable — today the
 * expo plugin's open-redirecting `/expo-authorization-proxy` — and hands
 * everything else to Better Auth.
 *
 * Done here rather than in a Better Auth `hooks.before` so the request never
 * enters Better Auth at all: no plugin `onRequest`, no rate-limit bookkeeping,
 * no dependence on how its router normalises a path. Must be revisited if
 * social login is ever enabled — see `@/lib/mobile-api/blocked-auth-paths`.
 */
function guarded(handler: AuthRouteHandler): AuthRouteHandler {
  return async (request) =>
    isBlockedAuthPath(new URL(request.url).pathname)
      ? notFound()
      : handler(request);
}

// Catch-all route that hands every /api/auth/* request to Better Auth.
export const GET = guarded(betterAuthHandlers.GET);
export const POST = guarded(betterAuthHandlers.POST);
export const PUT = guarded(betterAuthHandlers.PUT);
export const PATCH = guarded(betterAuthHandlers.PATCH);
export const DELETE = guarded(betterAuthHandlers.DELETE);

// HEAD and OPTIONS are spelled out so a blocked path is a 404 for *every*
// method. Left to Next, OPTIONS would answer 204 with an `Allow` header —
// harmless, but it would advertise an endpoint that is meant not to exist.
export const HEAD = guarded(betterAuthHandlers.GET);
export const OPTIONS = guarded(
  async () =>
    new Response(null, { status: 204, headers: { Allow: ALLOWED_METHODS } }),
);
