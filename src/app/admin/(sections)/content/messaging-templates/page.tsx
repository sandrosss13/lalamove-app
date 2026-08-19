"use client";

import { useEffect, useState } from "react";

import type { MessagingChannel } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminMessagingTemplateListResponse,
  AdminMessagingTemplateRow,
} from "@/app/api/admin/content/messaging-templates/route";
import {
  CONTENT_LOCALE_LABELS,
  MESSAGING_CHANNEL_LABELS,
  MessagingTemplateFormDialog,
} from "@/components/admin/content/messaging-template-form-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 6;

/**
 * Sentinel for "no channel filter". Radix's Select has no value for an
 * unselected item and rejects `""` as an item value, so the unfiltered choice
 * needs a stand-in — this one can never collide with a `MessagingChannel`.
 */
const ALL_CHANNELS = "__all__";

/** Filter options, in the order the picker offers them. */
const CHANNEL_FILTER_OPTIONS: MessagingChannel[] = ["EMAIL", "SMS"];

/** Which template the form dialog is open for: a new one, or an existing row. */
type FormState =
  { mode: "create" } | { mode: "edit"; row: AdminMessagingTemplateRow };

/** Matches how every other dashboard in the app renders a date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Pulls the API's `{ error }` message out of a failed response — a `403` for a
 * role that may not manage content says so, instead of showing the same
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
 * Confirmation for removing one template.
 *
 * A delete is worth a stop even though the row is only text: the key/channel/
 * locale triple is what the (later) sending code looks a message up by, so
 * removing the wrong one silently leaves an event with no wording. The body is
 * shown so staff can see what they are about to discard.
 *
 * Like the form dialog, it holds no `open` state: the parent mounts it only
 * while a row is selected, keyed by that row, so its pending and error state
 * start clean each time.
 */
function DeleteTemplateDialog({
  target,
  onClose,
  onCompleted,
}: {
  target: AdminMessagingTemplateRow;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/content/messaging-templates/${target.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(response, "Could not delete this template."),
        );
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
        // None of Radix's dismiss paths should interrupt a request in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete template</DialogTitle>
          <DialogDescription>
            Removes the {MESSAGING_CHANNEL_LABELS[target.channel]} wording for{" "}
            <span className="text-foreground">{target.key}</span> in{" "}
            {CONTENT_LOCALE_LABELS[target.locale]}. To stop it being used
            without losing the text, edit it and turn Active off instead.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg border border-border p-3 text-sm whitespace-pre-wrap">
          {target.body}
        </p>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter showCloseButton={false}>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `/admin/content/messaging-templates` — the wording of the platform's
 * transactional messages: one row per event key, channel and language.
 *
 * This page manages *content only*. Nothing here sends anything, and no
 * placeholder in a body is substituted — hooking the order lifecycle up to these
 * rows is a separate, later effort that reads the text this page lets staff
 * author.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, matching the rest of this admin surface: switching
 * the channel filter and saving an edit re-query a single JSON endpoint instead
 * of re-rendering the whole admin shell. The section layout above it already
 * gates *viewing*, and the endpoints re-check the `adminRole` on every request,
 * which is the real boundary.
 */
export default function AdminMessagingTemplatesPage() {
  const [channel, setChannel] = useState<
    MessagingChannel | typeof ALL_CHANNELS
  >(ALL_CHANNELS);
  const [data, setData] = useState<AdminMessagingTemplateListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<AdminMessagingTemplateRow | null>(null);
  // Bumped after any dialog closes, purely to re-run the fetch below so the
  // table shows the state the database now holds rather than a patched copy.
  // Reloading on a plain dismissal too is deliberate: it is one cheap GET, and
  // it means a save that partly failed can never leave a stale row on screen.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (channel !== ALL_CHANNELS) {
      params.set("channel", channel);
    }

    async function load() {
      try {
        const query = params.toString();
        const response = await fetch(
          `/api/admin/content/messaging-templates${query === "" ? "" : `?${query}`}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(response, "Could not load templates."),
          );
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminMessagingTemplateListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer query is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load templates.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [channel, reloadToken]);

  const items = data?.items ?? [];

  /** Closes whichever dialog is open and re-reads the list. */
  function closeDialogs() {
    setForm(null);
    setDeleteTarget(null);
    setReloadToken((token) => token + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={channel}
          onValueChange={(value) =>
            setChannel(value as MessagingChannel | typeof ALL_CHANNELS)
          }
        >
          <SelectTrigger
            aria-label="Filter templates by channel"
            className="w-full max-w-56"
          >
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CHANNELS}>All channels</SelectItem>
            {CHANNEL_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {MESSAGING_CHANNEL_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-3">
          {data ? (
            <p className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "template" : "templates"}
            </p>
          ) : null}
          <Button size="sm" onClick={() => setForm({ mode: "create" })}>
            New Template
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event key</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-destructive"
                >
                  <span role="alert">{error}</span>
                </TableCell>
              </TableRow>
            ) : loading && data === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  Loading templates…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {channel === ALL_CHANNELS
                    ? "No messaging templates yet."
                    : `No ${MESSAGING_CHANNEL_LABELS[channel]} templates yet.`}
                </TableCell>
              </TableRow>
            ) : (
              items.map((row: AdminMessagingTemplateRow) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top font-medium break-words">
                    {row.key}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline">
                      {MESSAGING_CHANNEL_LABELS[row.channel]}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    {CONTENT_LOCALE_LABELS[row.locale]}
                  </TableCell>
                  <TableCell className="max-w-xs align-top break-words">
                    {/* SMS rows have no subject line at all, which is a fact
                        about the channel rather than missing data. */}
                    {row.subject ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(row.updatedAt)}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setForm({ mode: "edit", row })}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleteTarget(row)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {form ? (
        <MessagingTemplateFormDialog
          // Keyed by the row being edited so the fields start from the right
          // values for each one, without an effect to reset them.
          key={form.mode === "edit" ? form.row.id : "create"}
          template={form.mode === "edit" ? form.row : null}
          onClose={closeDialogs}
          onCompleted={closeDialogs}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteTemplateDialog
          key={deleteTarget.id}
          target={deleteTarget}
          onClose={closeDialogs}
          onCompleted={closeDialogs}
        />
      ) : null}
    </div>
  );
}
