/**
 * Runs `src/middleware.ts` against a list of requests and prints what it did
 * with each, as JSON on stdout. Driven by `tests/under-construction.spec.ts`.
 *
 * It exists as a separate process, rather than as an import inside the spec,
 * because every host and flag value the middleware consults is read from
 * `process.env` *once, at module load* (`src/lib/host.ts`,
 * `src/lib/under-construction.ts`). A spec importing the middleware would get
 * whichever configuration the first importer in its Playwright worker happened
 * to load with, and could not test two configurations side by side. A fresh
 * process per configuration has no such cache.
 *
 * Input: `PROBE_REQUESTS`, a JSON array of `{ url, cookie? }`. Output: one
 * `{ url, kind, location, rewrite, robots }` per request, in order.
 */
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

interface ProbeRequest {
  url: string;
  cookie?: string;
}

const requests = JSON.parse(
  process.env.PROBE_REQUESTS ?? "[]",
) as ProbeRequest[];

const results = requests.map(({ url, cookie }) => {
  const parsed = new URL(url);
  const headers = new Headers({ host: parsed.host });
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = middleware(new NextRequest(url, { headers }));
  const location = response.headers.get("location");
  const rewrite = response.headers.get("x-middleware-rewrite");

  return {
    url,
    kind: location ? "redirect" : rewrite ? "rewrite" : "next",
    location,
    // Reported as a path: the origin of a rewrite is always the request's own.
    rewrite: rewrite ? new URL(rewrite).pathname : null,
    robots: response.headers.get("x-robots-tag"),
  };
});

process.stdout.write(JSON.stringify(results));
