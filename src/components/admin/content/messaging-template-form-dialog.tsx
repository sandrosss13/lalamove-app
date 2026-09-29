"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ContentLocale, MessagingChannel } from "@prisma/client";

// Type-only, so nothing of the server route (Prisma, Better Auth) is pulled into
// this client bundle — it is erased at compile time. Sharing the row shape with
// the endpoint that produces it is what stops the form and the API drifting
// apart.
import type { AdminMessagingTemplateRow } from "@/app/api/admin/content/messaging-templates/route";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * `MessagingChannel` rendered for humans. Exported because the templates table
 * shows the same labels and the two must not drift; it lives here, next to the
 * picker, because this is also where the option order is decided.
 */
export const MESSAGING_CHANNEL_LABELS: Record<MessagingChannel, string> = {
  EMAIL: "Email",
  SMS: "SMS",
};

/** `ContentLocale` rendered for humans, shared with the table for the same reason. */
export const CONTENT_LOCALE_LABELS: Record<ContentLocale, string> = {
  KA: "Georgian",
  EN: "English",
};

/**
 * The same two maps as full message paths, resolved where they render. The
 * English maps above stay exported for the templates table until it switches.
 */
export const MESSAGING_CHANNEL_LABEL_KEYS: Record<MessagingChannel, string> = {
  EMAIL: "admin.messagingTemplateFormDialog.channelEmail",
  SMS: "admin.messagingTemplateFormDialog.channelSms",
};

export const CONTENT_LOCALE_LABEL_KEYS: Record<ContentLocale, string> = {
  KA: "common.shared.georgian",
  EN: "common.shared.english",
};

/** Picker order for each enum. */
const CHANNEL_OPTIONS: MessagingChannel[] = ["EMAIL", "SMS"];
const LOCALE_OPTIONS: ContentLocale[] = ["KA", "EN"];

/**
 * The order-lifecycle events the platform is expected to message about, offered
 * as `datalist` suggestions rather than a fixed `<select>`: `key` is a free-text
 * column by design, so a new event must not need a UI change, but nine times out
 * of ten staff are authoring one of these and should not have to remember the
 * exact spelling. The task that wires actual sending looks templates up by these
 * strings.
 */
const KNOWN_TEMPLATE_KEYS = [
  "order.confirmed",
  "order.driver_assigned",
  "order.in_transit",
  "order.delivered",
  "order.cancelled",
];

/**
 * Placeholders the (later, separate) sending task will substitute. Informational
 * only — nothing in this feature parses or replaces them, so they are listed for
 * the author rather than validated against the body.
 */
const SUPPORTED_PLACEHOLDERS = [
  "{{orderId}}",
  "{{clientName}}",
  "{{pickupAddress}}",
];

/**
 * Mirror the limits the API enforces, so an over-long value is stopped at the
 * keyboard instead of by a 400. Restated rather than imported because a
 * `route.ts` may only export types.
 */
const MAX_KEY_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

type MessagingTemplateFormDialogProps = {
  /** The template being edited, or null to author a new one. */
  template: AdminMessagingTemplateRow | null;
  /** Dismissed without saving — the parent drops its target. */
  onClose: () => void;
  /** The template was created or updated; the parent should reload its list. */
  onCompleted: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response so staff see
 * *why* a save was refused (a duplicate key/channel/locale, a role that may not
 * edit content) rather than a generic failure. Falls back when the body is
 * missing or shaped unexpectedly, which is the case for an infrastructure-level
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
 * Authors or edits one transactional message template — the text of an
 * order-confirmed email or a driver-assigned SMS, per locale.
 *
 * One component covers both directions rather than two nearly identical ones:
 * only the endpoint, the HTTP method and the copy follow from whether a
 * `template` was passed, and splitting them would mean keeping two forms in step
 * forever.
 *
 * It holds no `open` state. The parent mounts it only while a row (or "new") is
 * selected and keys it by that, so every field starts from the right value
 * without an effect to reset them — closing is the parent dropping its target,
 * which is also what `onOpenChange` reports here.
 *
 * `subject` is rendered, and required, only for `EMAIL`: an SMS has no subject
 * line, and the column is nullable precisely because those rows never set one.
 * That rule is enforced here rather than in the API, which accepts either.
 */
export function MessagingTemplateFormDialog({
  template,
  onClose,
  onCompleted,
}: MessagingTemplateFormDialogProps) {
  const t = useTranslations();
  const isEditing = template !== null;

  const [key, setKey] = useState(template?.key ?? "");
  const [channel, setChannel] = useState<MessagingChannel>(
    template?.channel ?? "EMAIL",
  );
  const [locale, setLocale] = useState<ContentLocale>(template?.locale ?? "KA");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSubject = channel === "EMAIL";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedSubject = subject.trim();

    // Checked here as well as by the `required` attribute, since the field is
    // only mounted for EMAIL and a whitespace-only value would otherwise pass.
    if (needsSubject && trimmedSubject === "") {
      setError(
        t("admin.messagingTemplateFormDialog.aSubjectIsRequiredForEmail"),
      );
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        isEditing
          ? `/api/admin/content/messaging-templates/${template.id}`
          : "/api/admin/content/messaging-templates",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: key.trim(),
            channel,
            locale,
            // Explicitly null for SMS, so switching an existing email template
            // to SMS clears the subject rather than leaving a stale one behind.
            subject: needsSubject ? trimmedSubject : null,
            body,
            isActive,
          }),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            isEditing
              ? t("admin.messagingTemplateFormDialog.couldNotSave")
              : t("admin.messagingTemplateFormDialog.couldNotCreate"),
          ),
        );
        setPending(false);
        return;
      }

      // The parent reloads and unmounts this dialog, so `pending` stays true —
      // the button must not flash back to its idle label in between.
      onCompleted();
    } catch {
      setError(t("common.shared.somethingWentWrongPleaseTryAgain"));
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
              {isEditing
                ? t("admin.messagingTemplateFormDialog.editTemplate")
                : t("admin.messagingTemplateFormDialog.newTemplate")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "admin.messagingTemplateFormDialog.theWordingOfOneTransactionalMessage",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="messaging-template-key">
                {t("common.shared.eventKey")}
              </Label>
              <Input
                id="messaging-template-key"
                list="messaging-template-key-options"
                required
                maxLength={MAX_KEY_LENGTH}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={t(
                  "admin.messagingTemplateFormDialog.orderConfirmed",
                )}
                disabled={pending}
                autoFocus
              />
              <datalist id="messaging-template-key-options">
                {KNOWN_TEMPLATE_KEYS.map((knownKey) => (
                  <option key={knownKey} value={knownKey} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="messaging-template-channel">
                  {t("common.shared.channel")}
                </Label>
                <Select
                  value={channel}
                  onValueChange={(value) =>
                    setChannel(value as MessagingChannel)
                  }
                  disabled={pending}
                >
                  <SelectTrigger
                    id="messaging-template-channel"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(MESSAGING_CHANNEL_LABEL_KEYS[option])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="messaging-template-locale">
                  {t("common.shared.language")}
                </Label>
                <Select
                  value={locale}
                  onValueChange={(value) => setLocale(value as ContentLocale)}
                  disabled={pending}
                >
                  <SelectTrigger
                    id="messaging-template-locale"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(CONTENT_LOCALE_LABEL_KEYS[option])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {needsSubject ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="messaging-template-subject">
                  {t("common.shared.subject")}
                </Label>
                <Input
                  id="messaging-template-subject"
                  required
                  maxLength={MAX_SUBJECT_LENGTH}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder={t(
                    "admin.messagingTemplateFormDialog.yourOrderIsConfirmed",
                  )}
                  disabled={pending}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="messaging-template-body">
                {t("admin.messagingTemplateFormDialog.message")}
              </Label>
              <Textarea
                id="messaging-template-body"
                aria-describedby="messaging-template-body-help"
                required
                maxLength={MAX_BODY_LENGTH}
                rows={6}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("admin.messagingTemplateFormDialog.bodyExample")}
                disabled={pending}
              />
              <p
                id="messaging-template-body-help"
                className="text-xs text-muted-foreground"
              >
                {t("admin.messagingTemplateFormDialog.placeholdersFilledIn")}{" "}
                {SUPPORTED_PLACEHOLDERS.map((placeholder, index) => (
                  <span key={placeholder}>
                    {index > 0 ? ", " : null}
                    <code className="font-mono">{placeholder}</code>
                  </span>
                ))}
                .
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="messaging-template-is-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
                disabled={pending}
              />
              <Label htmlFor="messaging-template-is-active">
                {t("common.shared.active")}
              </Label>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              {t("common.shared.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? t("common.shared.saving")
                : isEditing
                  ? t("account.accountProfileForm.saveChanges")
                  : t("admin.messagingTemplateFormDialog.createTemplate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
