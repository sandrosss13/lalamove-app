"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

// Type-only imports — erased at compile time, so nothing of the server routes
// reaches this client bundle.
import type { AdminSupportMessageDetail } from "@/app/api/admin/support-messages/[id]/route";
import { readErrorMessage } from "@/components/admin/read-error-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocalizedCityOptions } from "@/lib/georgian-cities";
import type { SupportMessageStatus, SupportTopic } from "@/lib/support/rules";

/** Message path of each topic's name — the design's own radio labels. */
export const SUPPORT_TOPIC_LABEL_KEYS: Record<SupportTopic, string> = {
  PICKUP_OR_DROPOFF: "admin.adminSupportMessages.topicPickupOrDropoff",
  CARGO_DAMAGED_OR_MISSING:
    "admin.adminSupportMessages.topicCargoDamagedOrMissing",
  PAYMENT_OR_WITHDRAWAL: "admin.adminSupportMessages.topicPaymentOrWithdrawal",
  DOCUMENTS_AND_ACCOUNT: "admin.adminSupportMessages.topicDocumentsAndAccount",
  OTHER: "admin.adminSupportMessages.topicOther",
  CONTACT_UNREACHABLE: "admin.adminSupportMessages.topicContactUnreachable",
  ADDRESS_WRONG_OR_INACCESSIBLE:
    "admin.adminSupportMessages.topicAddressWrongOrInaccessible",
  CARGO_MISMATCH: "admin.adminSupportMessages.topicCargoMismatch",
  VEHICLE_BREAKDOWN: "admin.adminSupportMessages.topicVehicleBreakdown",
  ACCIDENT: "admin.adminSupportMessages.topicAccident",
};

export const SUPPORT_STATUS_LABEL_KEYS: Record<SupportMessageStatus, string> = {
  OPEN: "admin.adminSupportMessages.statusOpen",
  RESOLVED: "admin.adminSupportMessages.statusResolved",
};

/** One labelled fact in the panel. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * One support message in full: who sent it and the number to call them on, the
 * job it is about, what they wrote, and the one action — mark resolved.
 *
 * There is no reply box because there is no reply channel; the panel says so,
 * so a member of staff does not look for one.
 */
export function SupportMessageDetailDialog({
  messageId,
  onClose,
  onChanged,
}: {
  messageId: string;
  onClose: () => void;
  /** Called after the message is resolved, so the queue behind can re-fetch. */
  onChanged: () => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const cityOptions = useLocalizedCityOptions();
  const [data, setData] = useState<AdminSupportMessageDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/support-messages/${messageId}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          setLoadError(
            await readErrorMessage(
              response,
              t("admin.adminSupportMessages.couldNotLoadMessage"),
            ),
          );
          return;
        }

        setData((await response.json()) as AdminSupportMessageDetail);
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(t("admin.adminSupportMessages.couldNotLoadMessage"));
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [messageId, t]);

  async function resolve() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/support-messages/${messageId}/resolve`,
        { method: "POST" },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            t("admin.adminSupportMessages.couldNotResolve"),
          ),
        );
        setPending(false);
        return;
      }

      onChanged();
      onClose();
    } catch {
      setError(t("admin.adminSupportMessages.couldNotResolve"));
      setPending(false);
    }
  }

  const cityLabel = data
    ? (cityOptions.find((option) => option.value === data.driver.city)?.label ??
      data.driver.city)
    : "";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {data
              ? t(SUPPORT_TOPIC_LABEL_KEYS[data.topic])
              : t("admin.adminSupportMessages.supportMessage")}
          </DialogTitle>
          <DialogDescription>
            {data
              ? format.dateTime(new Date(data.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : (loadError ?? t("admin.adminSupportMessages.loadingMessages"))}
          </DialogDescription>
        </DialogHeader>

        {loadError !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : null}

        {data ? (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("common.shared.driver")}>
                {data.driver.name}
                <span className="block text-xs text-muted-foreground">
                  {[cityLabel, data.driver.companyName]
                    .filter((part) => part !== null && part !== "")
                    .join(" · ")}
                </span>
              </Field>
              <Field label={t("common.shared.phone")}>
                <a
                  href={`tel:${data.driver.phone}`}
                  className="font-mono underline-offset-2 hover:underline"
                  aria-label={t("admin.adminSupportMessages.callDriver", {
                    phone: data.driver.phone,
                  })}
                >
                  {data.driver.phone}
                </a>
              </Field>
              <Field label={t("admin.adminSupportMessages.job")}>
                {data.order === null ? (
                  <span className="text-muted-foreground">
                    {t("admin.adminSupportMessages.noJobAttached")}
                  </span>
                ) : (
                  <>
                    <span className="font-mono">{data.order.reference}</span>
                    <span className="block text-xs text-muted-foreground">
                      {data.order.pickupAddress} → {data.order.dropoffAddress}
                    </span>
                  </>
                )}
              </Field>
              <Field label={t("common.shared.status")}>
                <Badge
                  variant={data.status === "OPEN" ? "default" : "secondary"}
                >
                  {t(SUPPORT_STATUS_LABEL_KEYS[data.status])}
                </Badge>
                {data.status === "RESOLVED" && data.resolvedByName !== null ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("admin.adminSupportMessages.resolvedBy", {
                      name: data.resolvedByName,
                    })}
                  </span>
                ) : null}
              </Field>
            </dl>

            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                {t("admin.adminSupportMessages.whatHappened")}
              </p>
              {/* `whitespace-pre-wrap`: the driver's own line breaks are part
                  of the message. Rendered as text — never as HTML. */}
              <p className="rounded-lg bg-muted p-3 text-sm break-words whitespace-pre-wrap">
                {data.body}
              </p>
            </div>

            {error !== null ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {data.status === "OPEN" ? (
              <DialogFooter className="items-center gap-3 sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("admin.adminSupportMessages.noReplyChannel")}
                </p>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void resolve()}
                >
                  {pending
                    ? t("admin.adminSupportMessages.resolving")
                    : t("admin.adminSupportMessages.markResolved")}
                </Button>
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
