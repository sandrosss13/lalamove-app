/**
 * The rules that bound signed upload URLs — how many may be outstanding for
 * one order's proof of delivery or one vehicle's documents, and for how long
 * one counts — with nothing else attached.
 *
 * Deliberately free of runtime imports (no `server-only`, no Prisma, no
 * Supabase, no Next), the arrangement `orders/pod-rules.ts` has, so
 * `tests/pending-upload-rules.spec.ts` can pin every rule without a server or a
 * database. `./pending-uploads.ts` is the half that touches the database and
 * asks this module for each decision.
 *
 * ## What is being bounded
 *
 * A signed upload URL is a bearer token for writing one object. Nothing about
 * it pins the size or type of what is PUT to it, and the routes only check
 * those when the app *registers* the upload. An account that mints URLs and
 * never registers could therefore fill a bucket with objects nothing references
 * and nothing ever inspected. Two limits close that, and they are different
 * layers:
 *
 * 1. **How many** unregistered uploads may exist per order / per vehicle — the
 *    caps below, counted in the database (`PendingUpload`).
 * 2. **How large and of what type** each one may be — which only the bucket can
 *    enforce, because the bytes never pass through this server. See
 *    `REQUIRED_BUCKET_LIMITS`.
 */

/**
 * How long a signed upload URL can be written to. Supabase Storage fixes this
 * at two hours and offers no parameter to shorten it, so it is a fact recorded
 * here rather than a choice: a `PendingUpload` row is live for exactly as long
 * as its URL is usable, and may be swept — with its object — once it is not.
 */
export const SIGNED_UPLOAD_URL_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Outstanding (issued, not yet registered) uploads allowed per order.
 *
 * A delivery registers at most three photos and one signature. Eight is that
 * with every one retried once — room for a flaky connection at a customer's
 * door, where an upload that never completes still holds its slot until the URL
 * expires — and nothing like room to use the bucket as storage.
 */
export const MAX_PENDING_POD_UPLOADS = 8;

/**
 * Outstanding uploads allowed per vehicle. A vehicle has two documents; six is
 * each of them attempted three times inside one URL lifetime.
 */
export const MAX_PENDING_VEHICLE_DOCUMENT_UPLOADS = 6;

/** When a URL issued at `now` stops being usable. */
export function pendingUploadExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SIGNED_UPLOAD_URL_TTL_MS);
}

/** Whether another upload URL may be issued. */
export type PendingUploadDecision =
  | { allowed: true }
  /**
   * Refused. `retryAfterSeconds` is how long until the oldest outstanding
   * upload expires and frees its slot — the honest answer to "when can I try
   * again", and at least one second so a client never retries in a tight loop.
   */
  | { allowed: false; retryAfterSeconds: number };

/**
 * Decides whether a new upload URL may be issued, given the uploads still
 * outstanding for the same order or vehicle.
 *
 * `liveExpiries` are the `expiresAt` of the rows that have **not** expired at
 * `now`; the caller has already swept the rest. A registered upload has no row,
 * so the normal flow (issue, upload, register) never accumulates anything —
 * only uploads that were started and abandoned count.
 */
export function pendingUploadDecision(input: {
  liveExpiries: readonly Date[];
  cap: number;
  now: Date;
}): PendingUploadDecision {
  const { liveExpiries, cap, now } = input;

  if (liveExpiries.length < cap) {
    return { allowed: true };
  }

  // With nothing outstanding the refusal can only come from a cap of zero —
  // uploads switched off — and there is no row whose expiry would free a slot;
  // one URL lifetime is then the honest "not soon", and keeps the figure
  // finite (`Math.min()` of nothing is Infinity).
  const soonest =
    liveExpiries.length === 0
      ? now.getTime() + SIGNED_UPLOAD_URL_TTL_MS
      : Math.min(...liveExpiries.map((expiry) => expiry.getTime()));

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((soonest - now.getTime()) / 1000)),
  };
}

const BYTES_PER_MB = 1024 * 1024;

/**
 * **What each Supabase bucket must be configured with**, in the dashboard
 * (Storage → the bucket → Edit bucket) or with `storage.updateBucket`. This
 * code cannot set them — buckets are provisioned by hand, see `env.example` —
 * and without them an upload that is never registered is never checked at all:
 * the caps above bound how *many* such objects exist, and these bound what each
 * one can be.
 *
 * The values are the same ceilings the register routes enforce after the fact
 * (`MAX_POD_PHOTO_BYTES`, `MAX_VEHICLE_DOCUMENT_BYTES`), and
 * `tests/pending-upload-rules.spec.ts` pins the two against each other so they
 * cannot drift. A signature's own 1 MB cap is tighter than its bucket's and
 * stays a registration-time check: one bucket has one size limit.
 *
 * `driver-documents` is shared with the onboarding documents, which accept the
 * same two types, so the limit fits both.
 */
export const REQUIRED_BUCKET_LIMITS = {
  "delivery-proofs": {
    public: false,
    fileSizeLimitBytes: 10 * BYTES_PER_MB,
    allowedMimeTypes: ["image/jpeg", "image/png"],
  },
  "driver-documents": {
    public: false,
    fileSizeLimitBytes: 10 * BYTES_PER_MB,
    allowedMimeTypes: ["image/jpeg", "image/png"],
  },
} as const;
