/**
 * Client-side downscaling for the booking form's cargo photos.
 *
 * Phone cameras produce 4–12 MB originals at 4000+ px, which is far more than a
 * driver needs to see what is being loaded and more than the upload route
 * accepts. Every photo is therefore re-encoded in the browser before it is
 * kept: longest side capped, JPEG at a fixed quality, and a hard size ceiling
 * checked on the result.
 */

/** Longest edge, in pixels, a stored cargo photo may have. */
export const CARGO_PHOTO_MAX_DIMENSION_PX = 1600;

/** JPEG quality for the first encode attempt. */
const CARGO_PHOTO_JPEG_QUALITY = 0.82;

/**
 * Lower qualities tried, in order, if the first encode is still too large.
 * At 1600 px this essentially never triggers, but a pathological image (dense
 * noise) can exceed the ceiling, and failing outright would be worse than a
 * slightly softer photo.
 */
const CARGO_PHOTO_FALLBACK_QUALITIES = [0.7, 0.55] as const;

/** Strict upper bound on an encoded photo, matching the upload route's limit. */
export const CARGO_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

const CARGO_PHOTO_MIME_TYPE = "image/jpeg";

/** Why a photo could not be prepared, for the caller to word. */
export type CargoPhotoCompressError = "DECODE_FAILED" | "TOO_LARGE";

export class CargoPhotoCompressionError extends Error {
  readonly code: CargoPhotoCompressError;

  constructor(code: CargoPhotoCompressError) {
    super(code);
    this.name = "CargoPhotoCompressionError";
    this.code = code;
  }
}

/** Something drawable onto a canvas, with its natural size and a disposer. */
type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

/**
 * Decode `file` into a drawable image.
 *
 * `createImageBitmap` first, asking it to honour EXIF orientation so a portrait
 * phone photo is not stored sideways. Falls back to an `<img>` element for
 * browsers whose `createImageBitmap` rejects the format or the options. Safari
 * decodes HEIC through either route; Chrome and Firefox decode it through
 * neither, which surfaces as `DECODE_FAILED` for that one file.
 */
async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the element-based decoder.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new CargoPhotoCompressionError("DECODE_FAILED");
  }
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, CARGO_PHOTO_MIME_TYPE, quality);
  });
}

/**
 * Downscale and re-encode one photo as a JPEG no larger than
 * `CARGO_PHOTO_MAX_BYTES`, with its longest side at most
 * `CARGO_PHOTO_MAX_DIMENSION_PX`.
 *
 * Throws `CargoPhotoCompressionError` when the browser cannot decode the file
 * (typically HEIC outside Safari) or no quality step gets it under the limit.
 */
export async function compressCargoPhoto(file: Blob): Promise<Blob> {
  const decoded = await decodeImage(file);

  try {
    if (decoded.width === 0 || decoded.height === 0) {
      throw new CargoPhotoCompressionError("DECODE_FAILED");
    }

    const scale = Math.min(
      1,
      CARGO_PHOTO_MAX_DIMENSION_PX / Math.max(decoded.width, decoded.height),
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new CargoPhotoCompressionError("DECODE_FAILED");
    }

    // JPEG has no alpha: paint white first so a transparent PNG does not come
    // out with a black background.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    for (const quality of [
      CARGO_PHOTO_JPEG_QUALITY,
      ...CARGO_PHOTO_FALLBACK_QUALITIES,
    ]) {
      const blob = await canvasToJpeg(canvas, quality);
      if (!blob) {
        throw new CargoPhotoCompressionError("DECODE_FAILED");
      }
      if (blob.size < CARGO_PHOTO_MAX_BYTES) {
        return blob;
      }
    }

    throw new CargoPhotoCompressionError("TOO_LARGE");
  } finally {
    decoded.release();
  }
}
