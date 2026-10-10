"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  CargoPhotoCompressionError,
  compressCargoPhoto,
  type CargoPhotoCompressError,
} from "@/components/home/cargo-photo-compress";

/** How many photos a client may attach to one booking. */
export const MAX_CARGO_PHOTOS = 3;

/** One photo, already downscaled and ready to upload. */
export type CargoPhoto = {
  id: string;
  /** The re-encoded JPEG — this, never the original, is what gets uploaded. */
  blob: Blob;
  /** Object URL of `blob` for the thumbnail; revoked when the photo goes. */
  previewUrl: string;
};

/**
 * Something the client should be told about the last add, worded at render.
 * `LIMIT` is "you picked more than the free slots"; the other two name a file
 * that could not be prepared.
 */
type CargoPhotoIssue =
  { code: "LIMIT" } | { code: CargoPhotoCompressError; fileName: string };

export type CargoPhotosState = {
  photos: CargoPhoto[];
  issues: CargoPhotoIssue[];
  /** Photos still being downscaled. */
  processing: number;
  addFiles: (files: File[]) => void;
  removePhoto: (id: string) => void;
  /**
   * Resolves once every pending downscale has finished, with the photos as
   * they then stand. The submit handler awaits this so a photo picked a moment
   * before pressing Book is not silently left behind.
   */
  settledPhotos: () => Promise<CargoPhoto[]>;
};

/**
 * The booking form's cargo-photo state: up to `MAX_CARGO_PHOTOS` downscaled
 * JPEGs held in memory until the order exists and they can be uploaded to it.
 *
 * Every mutation goes through `commit`, which updates a ref alongside the
 * state. The ref is what lets the async compression jobs and `settledPhotos`
 * read the current list without a stale closure, and what the unmount cleanup
 * revokes object URLs from.
 */
export function useCargoPhotos(): CargoPhotosState {
  const [photos, setPhotos] = useState<CargoPhoto[]>([]);
  const [issues, setIssues] = useState<CargoPhotoIssue[]>([]);
  const [processing, setProcessing] = useState(0);

  const photosRef = useRef<CargoPhoto[]>([]);
  // Slots promised to files still being compressed, so two quick picks cannot
  // together exceed the limit.
  const reservedRef = useRef(0);
  // Compression jobs run one after another; this is the tail of that chain.
  const pendingRef = useRef<Promise<void>>(Promise.resolve());
  const nextIdRef = useRef(0);
  const mountedRef = useRef(false);

  const commit = useCallback((next: CargoPhoto[]) => {
    photosRef.current = next;
    setPhotos(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const current = photosRef;

    return () => {
      mountedRef.current = false;
      // The blobs live only in this form; nothing else holds these URLs.
      for (const photo of current.current) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    };
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const free = Math.max(
        0,
        MAX_CARGO_PHOTOS - photosRef.current.length - reservedRef.current,
      );
      const accepted = files.slice(0, free);
      setIssues(accepted.length < files.length ? [{ code: "LIMIT" }] : []);

      if (accepted.length === 0) {
        return;
      }

      reservedRef.current += accepted.length;
      setProcessing(reservedRef.current);

      pendingRef.current = pendingRef.current.then(async () => {
        for (const file of accepted) {
          try {
            const blob = await compressCargoPhoto(file);
            if (!mountedRef.current) {
              continue;
            }

            nextIdRef.current += 1;
            commit([
              ...photosRef.current,
              {
                id: `cargo-photo-${nextIdRef.current}`,
                blob,
                previewUrl: URL.createObjectURL(blob),
              },
            ]);
          } catch (cause) {
            if (mountedRef.current) {
              const code =
                cause instanceof CargoPhotoCompressionError
                  ? cause.code
                  : "DECODE_FAILED";
              setIssues((current) => [
                ...current,
                { code, fileName: file.name },
              ]);
            }
          } finally {
            reservedRef.current -= 1;
            if (mountedRef.current) {
              setProcessing(reservedRef.current);
            }
          }
        }
      });
    },
    [commit],
  );

  const removePhoto = useCallback(
    (id: string) => {
      const target = photosRef.current.find((photo) => photo.id === id);
      if (!target) {
        return;
      }

      URL.revokeObjectURL(target.previewUrl);
      commit(photosRef.current.filter((photo) => photo.id !== id));
      setIssues([]);
    },
    [commit],
  );

  const settledPhotos = useCallback(async () => {
    await pendingRef.current;
    return photosRef.current;
  }, []);

  return { photos, issues, processing, addFiles, removePhoto, settledPhotos };
}

/**
 * Step 6 of the booking form: optional cargo photos.
 *
 * The file input is hidden and opened from a button, and deliberately carries
 * no `capture` attribute: with `accept="image/*"` alone, iOS and Android both
 * offer "Take photo" *and* the photo library, whereas `capture` would force the
 * camera and lock the client out of a photo they already took.
 */
export function CargoPhotosField({
  state,
  disabled = false,
}: {
  state: CargoPhotosState;
  /** True while the booking is being submitted. */
  disabled?: boolean;
}) {
  const t = useTranslations("home.bookingForm");
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const { photos, issues, processing, addFiles, removePhoto } = state;
  const full = photos.length + processing >= MAX_CARGO_PHOTOS;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    // Cleared so picking the same file again (after removing it) still fires
    // a change event.
    event.target.value = "";
  }

  function issueMessage(issue: CargoPhotoIssue): string {
    switch (issue.code) {
      case "LIMIT":
        return t("cargoPhotosLimit", { max: MAX_CARGO_PHOTOS });
      case "TOO_LARGE":
        return t("cargoPhotoTooLarge", { name: issue.fileName });
      case "DECODE_FAILED":
        return t("cargoPhotoUnreadable", { name: issue.fileName });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />

      {photos.length > 0 || processing > 0 ? (
        <ul className="grid grid-cols-3 gap-2.5 sm:max-w-sm">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface"
            >
              {/* An in-memory object URL: `next/image` has nothing to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt={t("cargoPhotoAlt", { index: index + 1 })}
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                disabled={disabled}
                aria-label={t("removeCargoPhoto", { index: index + 1 })}
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-ink/80 text-paper transition-colors hover:bg-accent hover:text-ink disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
          {Array.from({ length: processing }, (_, index) => (
            <li
              key={`processing-${index}`}
              aria-hidden="true"
              className="flex aspect-square animate-pulse items-center justify-center rounded-xl border border-dashed border-line bg-surface text-[0.6875rem] text-muted"
            >
              {t("processingPhoto")}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || full}
          aria-describedby={statusId}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[0.8125rem] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-paper"
        >
          <Camera aria-hidden="true" className="size-4" />
          {t("takeOrUploadPhoto")}
        </button>
        <p id={statusId} className="text-xs text-muted tabular-nums">
          {t("cargoPhotosCount", {
            count: photos.length,
            max: MAX_CARGO_PHOTOS,
          })}
        </p>
      </div>

      {issues.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1">
          {issues.map((issue, index) => (
            <li key={index} className="text-xs leading-snug text-accent">
              {issueMessage(issue)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
