"use client";

import { useEffect, useState } from "react";

import type { PaymentMethodType } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminPaymentMethodListResponse,
  AdminPaymentMethodRow,
} from "@/app/api/admin/finance/payment-methods/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 3;

const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  CASH: "Cash on delivery",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
};

/**
 * Extra context shown under a method's name. Partial on purpose — only a method
 * with something staff must know about carries a note.
 */
const PAYMENT_METHOD_NOTES: Partial<Record<PaymentMethodType, string>> = {
  // The switch is real, the integration behind it is not: no payment gateway is
  // wired up yet, so enabling this records the intent to offer cards and
  // nothing more.
  CARD: "Gateway integration pending — enabling this does not charge cards yet.",
};

/**
 * Pulls the API's `{ error }` message out of a failed response — a `403` for a
 * role that may not manage payment methods says so, instead of showing the same
 * "could not load" as a network failure.
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
 * `/admin/finance/payment-methods` — which payment methods the platform offers
 * at checkout, one row per `PaymentMethodType`.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, because that endpoint is also what seeds a method
 * that has no row yet: doing the read through it means the page gets exactly
 * one row per method on a fresh database without duplicating the seeding logic
 * on the server side of this file. The section layout above it already gates
 * *viewing*, and the endpoints re-check the `adminRole` on every request, which
 * is the real boundary.
 *
 * The toggle is the whole feature. Nothing here processes a payment or talks to
 * a gateway — that integration is still pending a provider decision, which is
 * why `CARD` carries a note saying so.
 */
export default function AdminPaymentMethodsPage() {
  const [items, setItems] = useState<AdminPaymentMethodRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The method currently being written, so only its own button goes into a
  // pending state instead of the whole table locking up.
  const [pendingType, setPendingType] = useState<PaymentMethodType | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/admin/finance/payment-methods", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(
            await readErrorMessage(response, "Could not load payment methods."),
          );
          setLoading(false);
          return;
        }

        const body = (await response.json()) as AdminPaymentMethodListResponse;
        setItems(body.items);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load payment methods.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  async function handleToggle(method: AdminPaymentMethodRow) {
    setError(null);
    setPendingType(method.type);

    try {
      const response = await fetch(
        `/api/admin/finance/payment-methods/${method.type}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isEnabled: !method.isEnabled }),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            "Could not update this payment method.",
          ),
        );
        return;
      }

      // The endpoint answers with the row it stored, so the table shows what
      // the database now holds rather than the state this click assumed.
      const updated = (await response.json()) as AdminPaymentMethodRow;

      setItems((current) =>
        current === null
          ? current
          : current.map((entry) =>
              entry.type === updated.type ? updated : entry,
            ),
      );
    } catch {
      setError("Could not update this payment method.");
    } finally {
      setPendingType(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Payment methods offered at checkout, platform-wide.
      </p>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  Loading payment methods…
                </TableCell>
              </TableRow>
            ) : items === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-destructive"
                >
                  <span role="alert">
                    {error ?? "Could not load payment methods."}
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              items.map((method) => {
                const note = PAYMENT_METHOD_NOTES[method.type];
                const pending = pendingType === method.type;

                return (
                  <TableRow key={method.type}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {PAYMENT_METHOD_LABELS[method.type]}
                        </span>
                        {note ? (
                          <span className="text-xs text-muted-foreground">
                            {note}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {method.isEnabled ? (
                        <Badge variant="secondary">Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={method.isEnabled ? "outline" : "default"}
                        disabled={pending}
                        // Spelled out because "Disable" on its own says nothing
                        // about which method it belongs to out of table context.
                        aria-label={`${method.isEnabled ? "Disable" : "Enable"} ${PAYMENT_METHOD_LABELS[method.type]}`}
                        onClick={() => void handleToggle(method)}
                      >
                        {method.isEnabled ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* A load failure replaces the table body above; this is for a failed
          toggle, where the table is still showing the last known state. */}
      {error && items !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
