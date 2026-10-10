/**
 * The rules of proof of delivery (POD) — what may be uploaded, how much of it,
 * and what a delivery needs before it can be closed — with nothing else
 * attached.
 *
 * Deliberately free of runtime imports (no `server-only`, no Prisma, no
 * Supabase, no Next) so `tests/pod-rules.spec.ts` can pin every rule without a
 * server, a database or a bucket — the arrangement `job-sheet-access.ts` and
 * `mobile-api/access.ts` have. The modules that touch Storage and the database
 * (`src/lib/pod-storage.ts`, the routes under `src/app/api/orders/[id]/pod`)
 * ask this one for every decision, so a rule has one statement.
 */

/** The two kinds of proof a delivery carries. */
export type PodKind = "PHOTO" | "SIGNATURE";

export const POD_KINDS: readonly PodKind[] = ["PHOTO", "SIGNATURE"];

/** A delivery needs at least this many photos before it can be completed. */
export const MIN_POD_PHOTOS = 1;

/** …and may carry at most this many. The design's "1–3 are required". */
export const MAX_POD_PHOTOS = 3;

const BYTES_PER_MB = 1024 * 1024;

/**
 * The largest photo recorded. A phone camera's JPEG is 2–6 MB and the app is
 * expected to downscale before uploading; 10 MB — the onboarding documents'
 * design cap — leaves room for one that did not, without letting a signed
 * upload URL become free bulk storage.
 */
export const MAX_POD_PHOTO_BYTES = 10 * BYTES_PER_MB;

/**
 * The largest signature recorded. A 160px-tall pad exported as a PNG is tens of
 * kilobytes; 1 MB is two orders of magnitude of headroom.
 */
export const MAX_POD_SIGNATURE_BYTES = BYTES_PER_MB;

/**
 * What Storage may hold for each kind.
 *
 * **The signature is PNG only — not SVG, though the design allows either.**
 * Three reasons, in order of weight:
 *
 * 1. An SVG is a document, not an image. Proof is read by opening a signed URL,
 *    and an `image/svg+xml` object opened top-level executes any script inside
 *    it on the Storage origin. `driver-document-storage.ts` excludes SVG for
 *    exactly this reason; accepting it here would need a sanitiser this codebase
 *    does not have, guarding a file a third party (the recipient's finger, via
 *    the driver's device) authored.
 * 2. A PNG is rendered by React Native's `<Image>` and by the browser's `<img>`
 *    with no extra dependency; SVG paths need `react-native-svg` on one side and
 *    a path renderer on the other, for no visible gain at 160px.
 * 3. One verification path. A PNG signature is checked exactly as a photo is —
 *    the content type and size Storage recorded — so there is no second,
 *    path-data validator to keep correct.
 *
 * What it costs: a raster does not scale. A signature is evidence that someone
 * signed, shown at roughly the size it was drawn, so that is not a loss here.
 */
const ALLOWED_CONTENT_TYPES: Record<PodKind, readonly string[]> = {
  PHOTO: ["image/jpeg", "image/png"],
  SIGNATURE: ["image/png"],
};

/** Narrows an untrusted body field to a `PodKind`. */
export function isPodKind(value: unknown): value is PodKind {
  return typeof value === "string" && POD_KINDS.includes(value as PodKind);
}

/** Whether Storage may hold an object of this content type for this kind. */
export function isAllowedPodContentType(
  kind: PodKind,
  contentType: string,
): boolean {
  return ALLOWED_CONTENT_TYPES[kind].includes(contentType);
}

/** The per-file byte ceiling for this kind. */
export function maxPodBytes(kind: PodKind): number {
  return kind === "PHOTO" ? MAX_POD_PHOTO_BYTES : MAX_POD_SIGNATURE_BYTES;
}

/** Characters allowed in the file-name suffix of an object path. */
const UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9._-]+/g;

/** Fallback name for an uploaded file with no usable original name. */
const FALLBACK_FILE_NAME = "proof";

/**
 * Bounds the file-name suffix. Storage keys have a length limit and the name
 * is decoration — the UUID before it is what makes the path unique.
 */
const MAX_FILE_NAME_LENGTH = 80;

/**
 * Normalises an uploaded file's name for use inside an object path: Storage
 * keys treat "/" as a folder separator, so an unsanitised name could otherwise
 * escape the order's own prefix.
 */
export function toSafePodFileName(fileName: string): string {
  const safe = fileName
    .trim()
    .replace(UNSAFE_FILE_NAME_CHARS, "-")
    .slice(-MAX_FILE_NAME_LENGTH);

  return safe.length > 0 && safe !== "." && safe !== ".."
    ? safe
    : FALLBACK_FILE_NAME;
}

/** The folder segment an object of this kind lives under. */
function kindSegment(kind: PodKind): string {
  return kind === "PHOTO" ? "photo" : "signature";
}

/**
 * The object path for one upload: `<orderId>/<photo|signature>/<uuid>-<name>`.
 *
 * Namespaced by order so a delivery's proof stays together, by kind so a path
 * issued for a photo can never be registered as the signature (whose type rule
 * is stricter), and prefixed with a UUID so two uploads of `IMG_0001.jpg` never
 * collide. The UUID is passed in rather than generated here to keep this
 * function pure.
 */
export function podObjectPath(
  orderId: string,
  kind: PodKind,
  uuid: string,
  fileName: string,
): string {
  return `${orderId}/${kindSegment(kind)}/${uuid}-${toSafePodFileName(fileName)}`;
}

/**
 * Exactly the character set `toSafePodFileName` can emit. Notably it excludes
 * "%", which is what keeps percent-encoded traversal out.
 */
const POD_FILE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Whether `path` is one this order could have been issued an upload URL for,
 * for this kind.
 *
 * Without this check the driver of one order could register an object path
 * belonging to **another** order and be handed a signed read URL for it — the
 * object exists, so "it wouldn't exist" is not the protection. Deliberately an
 * allowlist of the exact shape `podObjectPath` mints rather than a blacklist of
 * "..": the path is interpolated into a Storage URL downstream, where a URL
 * parser resolves "%2e%2e" into a dot segment just as it does a literal "..".
 * The same reasoning, at greater length, is on `isOwnedPath` in the onboarding
 * documents route.
 */
export function isPodObjectPath(
  path: string,
  orderId: string,
  kind: PodKind,
): boolean {
  const [prefix, segment, fileName, ...extra] = path.split("/");

  return (
    extra.length === 0 &&
    fileName !== undefined &&
    orderId !== "" &&
    prefix === orderId &&
    segment === kindSegment(kind) &&
    fileName !== "." &&
    fileName !== ".." &&
    POD_FILE_NAME.test(fileName)
  );
}

/**
 * How far a device's clock is allowed to disagree with the server's, at either
 * end of the window `takenAt` is accepted in. Five minutes is the usual
 * tolerance for a phone that sets its time from the network.
 */
export const TAKEN_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Resolves the `takenAt` a photo is recorded with.
 *
 * `takenAt` is the **device's** statement of when the picture was taken, kept
 * beside the server's own `createdAt` because the two answer different
 * questions in a dispute. A statement the server cannot believe is worth less
 * than none, so it is recorded only when it falls inside the one window in
 * which a proof photo can honestly have been taken:
 *
 * - **not before the job was started** (`startedAt`, the order's
 *   `inTransitAt`) — a delivery cannot be photographed before the load was
 *   picked up; and
 * - **not in the future** —
 *
 * each allowing `TAKEN_AT_CLOCK_SKEW_MS` for a device clock that is merely a
 * little off. **Outside that window the server's time (`now`) is recorded
 * instead.** The upload is real either way — the bytes are in the bucket — so
 * a phone with a wrong clock must not be stopped from proving a delivery; it
 * just does not get to write its wrong (or invented) time into the record.
 *
 * Absent (`undefined`/`null`) also resolves to `now`: the app did not say.
 * With no recorded `startedAt` the lower bound is `now` itself, so only a claim
 * within the skew of the server clock is kept.
 *
 * The one case answered with `null` — a 400 — is a value that is not an ISO
 * date-time at all (a number, an empty string, "yesterday"): that is a client
 * bug, and replacing it silently would hide it.
 */
export function resolveTakenAt(
  value: unknown,
  window: { startedAt: Date | null; now: Date },
): Date | null {
  const { startedAt, now } = window;

  if (value === undefined || value === null) {
    return now;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const earliest = (startedAt ?? now).getTime() - TAKEN_AT_CLOCK_SKEW_MS;
  const latest = now.getTime() + TAKEN_AT_CLOCK_SKEW_MS;
  const claimed = parsed.getTime();

  return claimed >= earliest && claimed <= latest ? parsed : now;
}

/** What is missing from a delivery's proof, as the code the route answers with. */
export type PodCompletionDenial =
  "POD_PHOTO_REQUIRED" | "POD_SIGNATURE_REQUIRED";

/**
 * Why this delivery's proof is not enough to complete it, or `null` when it is.
 *
 * Photos are checked first, so an order with neither reports the photo: the
 * design's capture screen lists photos above the signature, and one stable
 * answer for the both-missing case is what lets the app point at one field.
 *
 * The upper bound is not re-checked here. Registration refuses a fourth photo
 * under a row lock, so more than `MAX_POD_PHOTOS` cannot exist — and if a bad
 * write ever left four, refusing to complete a delivered job over it would
 * punish the driver for the server's fault.
 */
export function podCompletionDenial(proof: {
  photoCount: number;
  hasSignature: boolean;
}): PodCompletionDenial | null {
  if (proof.photoCount < MIN_POD_PHOTOS) {
    return "POD_PHOTO_REQUIRED";
  }

  if (!proof.hasSignature) {
    return "POD_SIGNATURE_REQUIRED";
  }

  return null;
}

/**
 * Request header by which the **web** hub declares that it cannot capture proof
 * of delivery, and its one accepted value.
 *
 * `POST /api/orders/[id]/complete` requires proof by default — fail closed, so
 * the driver app, and any client written later, is held to it without having to
 * remember to opt in. The web job sheet has no camera flow and no signature pad
 * (the design only draws them for the phone), so its completion dialog sends
 * this header and is let through as before.
 *
 * **This is a declared exemption, not a security boundary.** Anyone holding the
 * assigned driver's session can send the header; the web hub never enforced
 * proof, so nothing is lost relative to before, but nothing is gained on that
 * surface either. It goes away — header, constant and the branch reading it —
 * the day the web sheet gains a capture step.
 */
export const POD_WAIVER_HEADER = "x-pod-waiver";
export const POD_WAIVER_WEB_HUB = "web-hub";

/** Whether this request declares the web hub's exemption. */
export function isPodWaived(headers: {
  get(name: string): string | null;
}): boolean {
  return headers.get(POD_WAIVER_HEADER)?.trim() === POD_WAIVER_WEB_HUB;
}
