/**
 * The booking form's submit-time logic that does not need React: which label
 * the Book button wears while a booking is in flight, and how the step-6
 * cargo photos are sent to the order once it exists.
 *
 * Pulled out of `booking-form.tsx` because both got it wrong together. The
 * form used to switch the button to "Uploading photos…" unconditionally the
 * moment the order was created, and leave it there for the whole navigation to
 * checkout (`submitting` deliberately stays set until the form unmounts). So a
 * client who attached no photos at all watched "Book delivery" turn into
 * "Uploading photos…" and stay that way until checkout painted — which reads
 * as the form uploading (or re-uploading) something they never gave it. Now:
 *
 * - the "uploading" phase is entered only when there is at least one photo to
 *   send, and
 * - once the uploads are done the label goes back to the booking/saving one for
 *   the hand-off, so it never claims an upload that is no longer happening.
 *
 * Only pure imports, so this is safe in any client component and in the
 * Playwright pure specs (`tests/booking-submit.spec.ts`).
 */

/** Which part of a booking is in flight. */
export type SubmitPhase = "pricing" | "booking" | "uploading";

/** The `home.bookingForm` message keys the Book button can show. */
export type BookButtonLabelKey =
  | "bookDelivery"
  | "saveChanges"
  | "calculating"
  | "booking"
  | "saving"
  | "uploadingPhotos";

/**
 * The Book button's label: its resting call to action, or what the in-flight
 * booking is doing right now. Edit mode says "Save changes"/"Saving…" where a
 * new booking says "Book delivery"/"Booking…".
 */
export function bookButtonLabelKey({
  submitting,
  phase,
  isEditing,
}: {
  submitting: boolean;
  phase: SubmitPhase;
  isEditing: boolean;
}): BookButtonLabelKey {
  if (!submitting) {
    return isEditing ? "saveChanges" : "bookDelivery";
  }
  switch (phase) {
    case "pricing":
      return "calculating";
    case "uploading":
      return "uploadingPhotos";
    case "booking":
      return isEditing ? "saving" : "booking";
  }
}

/** The slice of `fetch` the uploader uses, so a spec can stand one in. */
export type PhotoUploadFetch = (
  input: string,
  init: { method: "POST"; body: FormData },
) => Promise<{ ok: boolean }>;

/**
 * Send each photo to `POST /api/orders/<orderId>/photos`, one request per
 * photo, one after another, each exactly once — the endpoint *appends* (it
 * mints a fresh storage path per request), so a second pass over the same list
 * would duplicate photos rather than replace them. Never throws: photos are
 * optional, and a failed upload must not strand an order that already exists.
 *
 * `onStart` fires once, before the first request, and only when there is at
 * least one photo — it is how the form enters the "uploading" phase without
 * ever entering it for an empty list.
 *
 * Resolves with how many uploads failed.
 */
export async function uploadCargoPhotoBlobs(
  orderId: string,
  blobs: readonly Blob[],
  fetchImpl: PhotoUploadFetch,
  onStart?: () => void,
): Promise<number> {
  if (blobs.length === 0) {
    return 0;
  }

  onStart?.();

  const url = `/api/orders/${encodeURIComponent(orderId)}/photos`;
  let failed = 0;

  for (const [index, blob] of blobs.entries()) {
    const body = new FormData();
    body.append("file", blob, `cargo-photo-${index + 1}.jpg`);

    try {
      const response = await fetchImpl(url, { method: "POST", body });
      if (!response.ok) {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return failed;
}
