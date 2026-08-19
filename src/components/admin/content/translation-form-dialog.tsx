"use client";

import { useState } from "react";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the form and the
// API drifting apart.
import type { AdminTranslationRow } from "@/app/api/admin/content/translations/route";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Mirrors the caps the translations routes enforce, which reject longer. */
const MAX_NAMESPACE_LENGTH = 100;
const MAX_KEY_LENGTH = 200;
const MAX_VALUE_LENGTH = 5000;

type TranslationFormDialogProps = {
  /**
   * The key being edited, or `null` to create a new one. Editing is limited to
   * the two values: `namespace` and `key` are the rows' identity, and no
   * endpoint renames them (see the PATCH route), so they are shown read-only
   * rather than offered as fields that would silently create a second key.
   */
  target: AdminTranslationRow | null;
  /** Dismissed without saving — the parent closes the dialog. */
  onClose: () => void;
  /** Something was written; the parent should reload its list. */
  onCompleted: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response so staff see
 * *why* a save was refused (a value over the limit, a role that may not edit
 * content) rather than a generic failure. Falls back when the body is missing
 * or shaped unexpectedly, which is the case for an infrastructure-level
 * failure.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}

/**
 * Creates a translation key with both locales, or edits an existing one.
 *
 * One component covers both because the fields are identical — only whether
 * `namespace`/`key` are editable, and which endpoints the submit hits, follow
 * from `target`.
 *
 * It holds no `open` state. The parent mounts it only while a key is selected
 * (keyed by that key), so the fields start from the right values for every row
 * instead of needing an effect to reset them — closing is the parent dropping
 * its selection, which is also what `onOpenChange` reports here.
 */
export function TranslationFormDialog({
  target,
  onClose,
  onCompleted,
}: TranslationFormDialogProps) {
  const isEditing = target !== null;

  const [namespace, setNamespace] = useState(target?.namespace ?? "");
  const [key, setKey] = useState(target?.key ?? "");
  const [valueKa, setValueKa] = useState(target?.ka?.value ?? "");
  const [valueEn, setValueEn] = useState(target?.en?.value ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Creates or overwrites both locale rows in one transactional request.
   *
   * Used for a brand-new key, and also when an existing key is missing one of
   * its locales (its row was deleted): the endpoint upserts, so this restores
   * the missing row and leaves the surviving one at the value shown.
   */
  async function submitBothLocales(
    trimmedNamespace: string,
    trimmedKey: string,
    trimmedKa: string,
    trimmedEn: string,
  ): Promise<string | null> {
    const response = await fetch("/api/admin/content/translations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: trimmedNamespace,
        key: trimmedKey,
        valueKa: trimmedKa,
        valueEn: trimmedEn,
      }),
    });

    return response.ok
      ? null
      : await readErrorMessage(response, "Could not save this translation.");
  }

  /** Updates one existing locale row, leaving the other untouched. */
  async function submitSingleLocale(
    id: string,
    value: string,
  ): Promise<string | null> {
    const response = await fetch(`/api/admin/content/translations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });

    return response.ok
      ? null
      : await readErrorMessage(response, "Could not save this translation.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedNamespace = namespace.trim();
    const trimmedKey = key.trim();
    const trimmedKa = valueKa.trim();
    const trimmedEn = valueEn.trim();

    // Checked here as well as server-side purely for the faster feedback; the
    // routes are what actually enforce it.
    if (trimmedNamespace === "" || trimmedKey === "") {
      setError("A namespace and a key are required.");
      return;
    }

    if (trimmedKa === "" || trimmedEn === "") {
      setError("Both the Georgian and the English value are required.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      // Which requests a submit becomes depends on what actually changed, so an
      // edit to one locale never rewrites (or bumps the `updatedAt` of) the
      // other, and so each path stays a single atomic request:
      //
      // - creating, or an existing key with a locale row missing → one POST,
      //   whose two upserts run in a transaction;
      // - editing where both values changed → the same POST, for the same
      //   atomicity (two independent PATCHes could half-apply);
      // - editing exactly one value → one PATCH on that row alone.
      const kaEntry = target?.ka ?? null;
      const enEntry = target?.en ?? null;
      const kaChanged = kaEntry === null || kaEntry.value !== trimmedKa;
      const enChanged = enEntry === null || enEntry.value !== trimmedEn;

      if (!kaChanged && !enChanged) {
        // Nothing to write. Closing rather than firing a no-op request keeps a
        // "save" that changed nothing out of the audit log.
        onClose();
        return;
      }

      let failure: string | null;

      if (!isEditing || (kaChanged && enChanged)) {
        failure = await submitBothLocales(
          trimmedNamespace,
          trimmedKey,
          trimmedKa,
          trimmedEn,
        );
      } else if (kaChanged && kaEntry !== null) {
        failure = await submitSingleLocale(kaEntry.id, trimmedKa);
      } else if (enChanged && enEntry !== null) {
        failure = await submitSingleLocale(enEntry.id, trimmedEn);
      } else {
        // Unreachable: a changed locale with no existing row is covered by the
        // POST branch above, since `kaEntry === null` forces `kaChanged`.
        failure = null;
      }

      if (failure !== null) {
        setError(failure);
        setPending(false);
        return;
      }

      // The parent reloads and unmounts this dialog, so `pending` stays true —
      // the button must not flash back to its idle label in between.
      onCompleted();
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Radix reports Escape, the overlay and the close button all through
        // here; none of them should interrupt a request already in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit translation" : "New translation key"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "A key's namespace and key can't be changed — create a new key instead."
                : "Both languages are saved together, so a key is never left translated on one side only."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="translation-namespace">Namespace</Label>
                <Input
                  id="translation-namespace"
                  value={namespace}
                  onChange={(event) => setNamespace(event.target.value)}
                  maxLength={MAX_NAMESPACE_LENGTH}
                  placeholder="landing"
                  // Read-only rather than absent, so an edit still shows which
                  // key is being changed.
                  readOnly={isEditing}
                  disabled={pending}
                  autoFocus={!isEditing}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="translation-key">Key</Label>
                <Input
                  id="translation-key"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  maxLength={MAX_KEY_LENGTH}
                  placeholder="hero.title"
                  readOnly={isEditing}
                  disabled={pending}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="translation-value-ka">Georgian (KA)</Label>
              <Textarea
                id="translation-value-ka"
                value={valueKa}
                onChange={(event) => setValueKa(event.target.value)}
                maxLength={MAX_VALUE_LENGTH}
                placeholder="ქართული ტექსტი"
                disabled={pending}
                autoFocus={isEditing}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="translation-value-en">English (EN)</Label>
              <Textarea
                id="translation-value-en"
                value={valueEn}
                onChange={(event) => setValueEn(event.target.value)}
                maxLength={MAX_VALUE_LENGTH}
                placeholder="English text"
                disabled={pending}
                required
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter showCloseButton={false}>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Create translation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
