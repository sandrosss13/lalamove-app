"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DocumentUploadDialog,
  type DocumentSlot,
} from "@/components/driver-onboarding/document-upload-dialog";
import {
  useOnboardingDraft,
  type OnboardingDocument,
  type OnboardingDocumentType,
} from "@/components/driver-onboarding/onboarding-draft-context";

/**
 * The post-submission status screen: pending verification, action required
 * (per-document rejection reasons plus re-upload), and approved. Rendered by
 * the shell in place of any wizard step whenever `status !== "DRAFT"`, so this
 * component never has to handle a draft — it takes no props and reads
 * everything from `useOnboardingDraft()`.
 *
 * Three states, one layout: a header (mono application reference + the driver's
 * name), one status card whose tone and copy branch on `status`, a
 * state-specific body, and a centred footnote. That shape comes straight from
 * the approved design (`design_handoff_driver_onboarding/README.md`, "Driver —
 * Application status").
 */

/** `POST` with no body; answers `{ status: "PENDING" }` or `{ error }`. */
const SUBMIT_ENDPOINT = "/api/driver-profile/onboarding/submit";
/** The pre-existing availability toggle, gated on `activatedAt` server-side. */
const STATUS_ENDPOINT = "/api/driver-profile/status";

const RESUBMIT_ERROR_FALLBACK =
  "We couldn't resubmit your application. Please try again.";
const GO_ONLINE_ERROR_FALLBACK =
  "We couldn't set you online. Please try again.";

/**
 * The two status colours the design names that have no counterpart in the
 * shadcn token set (`--destructive` already covers its red), each declared as a
 * class that sets one custom property rather than as a bare colour string.
 *
 * They used to be plain JS constants handed straight to inline `style`, which
 * was fine while every onboarding surface was pinned light. It stopped being
 * fine when `.dark` started theming this wizard: an inline style is a single
 * value computed in JS, with no media query or class selector above it, so
 * there is nowhere for a `dark:` variant to attach. Moving the decision into a
 * className hands it back to CSS — the card sets `--status-accent` once, the
 * `dark:` half overrides it, and the border, the `color-mix` tint, the dot and
 * the tag's ink all keep reading the same variable without any of them knowing
 * which theme is active. That is also what preserves the "one value per state"
 * guarantee below: there is still exactly one place per state to change.
 *
 * Both now point at `--status-success` / `--status-warning` from `globals.css`
 * instead of spelling the design prototype's `GREEN` and `AMBER` out here. The
 * values are unchanged — the token holds the same light pair, and the same hues
 * raised for the dark card (`--card` is `oklch(0.205 0 0)` there, and a
 * 0.5-lightness green on it barely registers as a colour, let alone as readable
 * ink). What changed is that the fleet status screen, the fleet step rail and
 * the admin review chips now read the same two names, so the "if either value
 * moves, it has to move in both" note this comment used to carry is no longer a
 * thing anyone has to remember.
 *
 * Note the missing `dark:` half: the token already flips, so restating it behind
 * the variant would only assert that the two themes differ somewhere they no
 * longer do.
 */
const STATUS_GREEN_ACCENT_CLASS =
  "[--status-accent:var(--color-status-success)]";
const STATUS_AMBER_ACCENT_CLASS =
  "[--status-accent:var(--color-status-warning)]";
/**
 * Action required is the one state whose accent already is a themed token, so
 * it needs no dark half — `--destructive` is redeclared by `html.dark` and the
 * var-chain follows on its own.
 */
const STATUS_DESTRUCTIVE_ACCENT_CLASS = "[--status-accent:var(--destructive)]";

/**
 * Each document's human label and the upload slot that replaces it — the
 * inverse of `SLOT_TO_DOCUMENT_TYPE`, written out rather than derived so the
 * labels live next to the mapping that needs them.
 */
const DOCUMENT_META: Record<
  OnboardingDocumentType,
  { label: string; slot: DocumentSlot }
> = {
  PROFILE_PHOTO: { label: "Profile photo", slot: "selfie" },
  LICENCE_FRONT: { label: "Licence — front", slot: "licFront" },
  LICENCE_BACK: { label: "Licence — back", slot: "licBack" },
};

/** What the review team wrote when the admin left the reason blank. */
const DEFAULT_FLAG_REASON = "Needs a new photo";

/**
 * `submittedSummary` reaches this component as `Record<string, unknown>` — the
 * context deliberately does not re-declare the API route's private response
 * type — so every field is read through one of these two guards. A missing or
 * wrong-typed field degrades to a dash rather than rendering `undefined`.
 */
function readSummaryText(
  summary: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = summary?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readSummaryList(
  summary: Record<string, unknown> | null,
  key: string,
): string[] | null {
  const value = summary?.[key];
  if (!Array.isArray(value)) return null;

  const entries = value.filter(
    (entry): entry is string => typeof entry === "string",
  );
  return entries.length > 0 ? entries : null;
}

/**
 * Reads an `{ error }` body without letting a non-JSON response (an HTML error
 * page from an unhandled crash, say) throw over the top of the real failure —
 * the same helper the draft context uses against the same API.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return payload?.error ?? fallback;
}

export function ApplicationStatusScreen() {
  const { status, reference, documents, submittedSummary, refetch, showToast } =
    useOnboardingDraft();

  // Which slot the retake dialog is showing, kept even while the dialog closes
  // so its copy doesn't blank out mid-animation; `retakeOpen` is what actually
  // opens and closes it.
  const [retakeSlot, setRetakeSlot] = useState<DocumentSlot | null>(null);
  const [retakeOpen, setRetakeOpen] = useState(false);

  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  const [goingOnline, setGoingOnline] = useState(false);
  const [goOnlineError, setGoOnlineError] = useState<string | null>(null);

  const router = useRouter();

  // Guard rather than an assumption: the shell only mounts this component once
  // the application has been submitted, but rendering nothing is the right
  // answer if that ever changes, not a card describing the wrong state.
  if (status === null || status === "DRAFT") return null;

  const driverName = readSummaryText(submittedSummary, "fullName");

  function openRetake(slot: DocumentSlot) {
    setRetakeSlot(slot);
    setRetakeOpen(true);
  }

  async function handleResubmit() {
    setResubmitting(true);
    setResubmitError(null);

    try {
      const response = await fetch(SUBMIT_ENDPOINT, { method: "POST" });

      if (!response.ok) {
        setResubmitError(
          await readErrorMessage(response, RESUBMIT_ERROR_FALLBACK),
        );
        return;
      }

      // The server is what decides the new status; re-reading it is what swaps
      // this screen over to the pending state.
      await refetch();
    } catch {
      setResubmitError(RESUBMIT_ERROR_FALLBACK);
    } finally {
      setResubmitting(false);
    }
  }

  async function handleGoOnline() {
    setGoingOnline(true);
    setGoOnlineError(null);

    try {
      const response = await fetch(STATUS_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: true }),
      });

      if (!response.ok) {
        setGoOnlineError(
          await readErrorMessage(response, GO_ONLINE_ERROR_FALLBACK),
        );
        setGoingOnline(false);
        return;
      }

      // Deliberately *not* re-enabled on the way out: the push is asynchronous,
      // and a button that comes back to life under a navigating page invites a
      // second request that can only race the first.
      router.push("/dashboard");
      router.refresh();
    } catch {
      setGoOnlineError(GO_ONLINE_ERROR_FALLBACK);
      setGoingOnline(false);
    }
  }

  return (
    <div className="max-w-[680px]">
      <header className="border-b border-border pb-5">
        <p className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          Application {reference ?? "—"}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
          {driverName ?? "Your application"}
        </h1>
      </header>

      <div className="pt-[22px]">
        {status === "PENDING" ? <PendingState /> : null}

        {status === "ACTION_REQUIRED" ? (
          <ActionRequiredState
            documents={documents}
            resubmitting={resubmitting}
            resubmitError={resubmitError}
            onRetake={openRetake}
            onResubmit={() => void handleResubmit()}
          />
        ) : null}

        {status === "APPROVED" ? (
          <ApprovedState
            summary={submittedSummary}
            goingOnline={goingOnline}
            goOnlineError={goOnlineError}
            onGoOnline={() => void handleGoOnline()}
          />
        ) : null}
      </div>

      {retakeSlot !== null ? (
        <DocumentUploadDialog
          slot={retakeSlot}
          open={retakeOpen}
          onOpenChange={setRetakeOpen}
          // No `refetch()` here: the dialog has already folded the new document
          // into the context via `recordDocument`, so the flagged row drops out
          // of the list on this render. A reload would repeat that work and
          // flash the shell's full-screen loading state over the top of it.
          onUploaded={() => {
            setRetakeOpen(false);
            showToast("Photo replaced. Resubmit when you're ready.");
          }}
        />
      ) : null}
    </div>
  );
}

/** Under review: the amber card, the three-row timeline, and the footnote. */
function PendingState() {
  return (
    <>
      <StatusCard
        tag="Pending verification"
        accentClass={STATUS_AMBER_ACCENT_CLASS}
        title="Under review"
        // The design's copy promises an SMS. This feature ships no SMS
        // infrastructure at all (see the spec's non-goals, which drop the OTP
        // step for the same reason), so the sentence points at this page —
        // which is where the decision actually appears — instead of at a
        // message that will never be sent.
        //
        // "checks for a decision every few seconds" rather than the stronger
        // "updates as soon as there is a decision": the draft context polls on
        // an interval (`STATUS_POLL_INTERVAL_MS`), so the update is automatic
        // but not instant, and the promise the driver is given has to be the
        // one the code actually keeps. What matters to them either way is the
        // part that is exactly true — they do not have to refresh.
        body="Our team is checking your licence, ID and vehicle photos. This page checks for a decision every few seconds, so there's no need to refresh it."
      />

      <ol className="mt-4 rounded-[14px] border border-border bg-card px-3.5">
        <TimelineRow label="Application submitted" when="Done" tone="done" />
        <TimelineRow
          label="Document review"
          when="In progress"
          tone="current"
        />
        <TimelineRow label="Account activation" when="Waiting" tone="waiting" />
      </ol>

      <Footnote>Typical review time is 12–24 hours on business days.</Footnote>
    </>
  );
}

/**
 * Action required: one row per still-flagged document, each with the admin's
 * reason and a Retake button, plus the resubmit CTA.
 *
 * The rows are derived from the live document list rather than from a snapshot
 * taken on mount, so replacing a document removes its row immediately — which
 * is also exactly what enables the CTA. Once the last one is replaced the list
 * is empty, and both the card's title and the CTA's label switch to say so,
 * mirroring how the design already swaps the CTA's own label at that moment.
 */
function ActionRequiredState({
  documents,
  resubmitting,
  resubmitError,
  onRetake,
  onResubmit,
}: {
  documents: OnboardingDocument[];
  resubmitting: boolean;
  resubmitError: string | null;
  onRetake: (slot: DocumentSlot) => void;
  onResubmit: () => void;
}) {
  const flaggedDocs = documents.filter(
    (document) => document.status === "FLAGGED",
  );
  const outstanding = flaggedDocs.length;

  return (
    <>
      <StatusCard
        tag="Action required"
        accentClass={STATUS_DESTRUCTIVE_ACCENT_CLASS}
        title={
          outstanding > 0
            ? `${outstanding} document${outstanding === 1 ? " needs" : "s need"} a new photo`
            : "All photos replaced"
        }
        body={
          outstanding > 0
            ? "The review team could not read the items below. Replace them and resubmit — the rest of your application is kept."
            : "Send your application back to the review team when you're ready — the rest of it is unchanged."
        }
      />

      <div className="mt-4 flex flex-col gap-2.5">
        {outstanding > 0 ? (
          <h2 className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            Needs a new photo
          </h2>
        ) : null}

        {flaggedDocs.map((document) => {
          const meta = DOCUMENT_META[document.type];

          return (
            <div
              key={document.type}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-[13px]"
            >
              {document.signedUrl !== null ? (
                <>
                  {/*
                    Plain <img> rather than next/image: driver documents live in
                    a private Supabase bucket behind a short-lived signed URL,
                    on a host configured per deployment, so it can't be pinned
                    in `remotePatterns` at build time.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={document.signedUrl}
                    alt={`The ${meta.label.toLowerCase()} the review team flagged`}
                    loading="lazy"
                    className="h-10 w-[52px] shrink-0 rounded-[7px] border border-border object-cover"
                  />
                </>
              ) : (
                // The document exists but its read URL could not be signed.
                // A neutral tile keeps the row's shape without a broken image.
                //
                // `bg-secondary` rather than `bg-muted`, here and everywhere
                // else in this file: the two tokens carry identical values in
                // both themes (`oklch(0.97 0 0)` light, `oklch(0.269 0 0)`
                // dark), so this is the same pixel — but `--color-muted` is the
                // var-chain `var(--admin-muted, var(--landing-muted))`, which
                // only lands on the shadcn value because `globals.css` pins
                // `--admin-muted` on `body:has([data-onboarding-surface])`.
                // `--color-secondary` reads `--secondary` directly and cannot
                // fall through to the landing palette at all.
                <div
                  aria-hidden="true"
                  className="h-10 w-[52px] shrink-0 rounded-[7px] bg-secondary"
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold">{meta.label}</p>
                <p className="mt-[3px] text-[12.5px] leading-[1.45] text-destructive">
                  {document.flagReason ?? DEFAULT_FLAG_REASON}
                </p>
              </div>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="shrink-0"
                onClick={() => onRetake(meta.slot)}
              >
                Retake
              </Button>
            </div>
          );
        })}

        <button
          type="button"
          // Disabled until every flagged document has been replaced: resubmitting
          // with one outstanding would only send the same unreadable photo back
          // for a second rejection.
          disabled={outstanding > 0 || resubmitting}
          onClick={onResubmit}
          // `text-white` on `bg-onboarding-accent` is correct in both themes
          // and is not an oversight: the brand orange is theme-independent by
          // design, so the label that sits on it has to be too. Do not "fix"
          // it to `text-foreground` or `text-primary-foreground`, either of
          // which inverts to near-black on orange in dark mode.
          className="mt-1 h-12 w-full cursor-pointer rounded-xl bg-onboarding-accent text-[15px] font-semibold text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
        >
          {outstanding > 0
            ? `Replace ${outstanding} photo${outstanding === 1 ? "" : "s"} to resubmit`
            : resubmitting
              ? "Resubmitting…"
              : "Resubmit application"}
        </button>

        {resubmitError !== null ? (
          <p role="alert" className="text-[13px] text-destructive">
            {resubmitError}
          </p>
        ) : null}
      </div>

      <Footnote>
        Resubmitted applications are usually reviewed within 4 hours.
      </Footnote>
    </>
  );
}

/** Approved: what was signed off, and the CTA that puts the driver to work. */
function ApprovedState({
  summary,
  goingOnline,
  goOnlineError,
  onGoOnline,
}: {
  summary: Record<string, unknown> | null;
  goingOnline: boolean;
  goOnlineError: string | null;
  onGoOnline: () => void;
}) {
  const make = readSummaryText(summary, "make");
  const model = readSummaryText(summary, "model");
  const categories = readSummaryList(summary, "categories");

  const rows: { label: string; value: string }[] = [
    {
      label: "Class",
      value: readSummaryText(summary, "vehicleClassName") ?? "—",
    },
    {
      label: "Vehicle",
      value: [make, model].filter((part) => part !== null).join(" ") || "—",
    },
    { label: "Plate", value: readSummaryText(summary, "plateNumber") ?? "—" },
    { label: "Categories", value: categories?.join(", ") ?? "—" },
  ];

  return (
    <>
      <StatusCard
        tag="Approved"
        accentClass={STATUS_GREEN_ACCENT_CLASS}
        title="You are cleared to drive"
        body="Your account is active. Orders matching your vehicle class will start arriving as soon as you go online."
      />

      <div className="mt-4 flex flex-col gap-3">
        <div className="rounded-[14px] border border-border bg-card p-[15px]">
          <h2 className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            Approved for dispatch
          </h2>
          <dl className="mt-[11px] flex flex-col gap-[9px]">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-3.5"
              >
                <dt className="text-[12.5px] text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="text-right text-[12.5px] font-medium">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <button
          type="button"
          disabled={goingOnline}
          onClick={onGoOnline}
          // The one green on this screen that is a solid FILL rather than ink,
          // so it takes `-solid` — the token half that stays at the design's
          // `oklch(0.5 0.13 145)` in both themes — rather than `status-success`,
          // which lifts for dark cards. The `text-white` sitting on it is the
          // reason: white reads 5.7:1 on this green and 2.3:1 on the lifted one,
          // so flipping the fill would break the one pairing that is currently
          // correct in both themes. The problem the lifted value solves never
          // arises here either — the fill is far brighter than the
          // `oklch(0.145 0 0)` page behind it (3.5:1, clear of the 3:1 a UI
          // boundary needs). Same call the brand-orange CTAs make, and since
          // this comment was written the fleet wizard's approved CTA has been
          // brought onto it too.
          className="h-[50px] w-full cursor-pointer rounded-xl bg-status-success-solid text-[15.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {goingOnline ? "Going online…" : "Go online and take orders"}
        </button>

        {goOnlineError !== null ? (
          <p role="alert" className="text-[13px] text-destructive">
            {goOnlineError}
          </p>
        ) : null}
      </div>

      <Footnote>
        Keep your licence and insurance current — we re-check 30 days before
        expiry.
      </Footnote>
    </>
  );
}

/**
 * The one card at the top of every state. `accentClass` is one of the three
 * constants at the top of this file; it sets `--status-accent`, which colours
 * the dot and the tag and, at low opacity, the border and background — one
 * declaration per state rather than four, so a state can't end up with a red
 * border and an amber dot.
 *
 * The inline styles below are deliberate and are not the thing dark mode had to
 * fix: each is `var(--status-accent)`, so the colour is chosen by CSS on the
 * element above and merely *read* here. Only the `color-mix` genuinely needs to
 * be inline — Tailwind's arbitrary-value syntax would have to spell the whole
 * expression, underscores and all, three times over — and once one of the four
 * is inline the other three may as well match it rather than split the same
 * decision across two mechanisms.
 */
function StatusCard({
  tag,
  accentClass,
  title,
  body,
}: {
  tag: string;
  accentClass: string;
  title: string;
  body: string;
}) {
  return (
    <section
      className={`animate-onboarding-fade-up rounded-2xl border p-[18px] ${accentClass}`}
      style={{
        borderColor: "var(--status-accent)",
        // `color-mix` rather than a hard-coded tint: the accent is a different
        // colour space per state (a token here, an oklch literal there), and
        // this keeps every state's wash the same strength regardless. Mixing
        // into `var(--card)` is also what carries the tint across themes for
        // free — the card is `oklch(1 0 0)` light and `oklch(0.205 0 0)` dark,
        // so the wash stays a 5% lift of whatever surface it is actually on.
        backgroundColor:
          "color-mix(in oklch, var(--status-accent) 5%, var(--card))",
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--status-accent)" }}
        />
        <p
          className="font-price text-[11px] font-semibold tracking-[0.08em] uppercase"
          style={{ color: "var(--status-accent)" }}
        >
          {tag}
        </p>
      </div>
      <h2 className="mt-2.5 text-[21px] leading-[1.2] font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      <p className="mt-[7px] text-[13.5px] leading-[1.55] text-muted-foreground">
        {body}
      </p>
    </section>
  );
}

/** One step of the pending state's review timeline. */
function TimelineRow({
  label,
  when,
  tone,
}: {
  label: string;
  when: string;
  tone: "done" | "current" | "waiting";
}) {
  // Same mechanism as `StatusCard`: the tone picks a class that declares
  // `--status-accent`, so the dark half of each colour travels with it. The
  // waiting dot borrows `--border` because it is meant to recede to the same
  // degree the rows' own hairlines do, in whichever theme is on.
  const dotAccentClass =
    tone === "done"
      ? STATUS_GREEN_ACCENT_CLASS
      : tone === "current"
        ? STATUS_AMBER_ACCENT_CLASS
        : "[--status-accent:var(--border)]";

  return (
    <li className="flex gap-3 border-b border-border py-[11px] last:border-b-0">
      <span className="flex w-4 shrink-0 justify-center pt-[3px]">
        <span
          aria-hidden="true"
          className={`size-[9px] rounded-full ${dotAccentClass}`}
          style={{ backgroundColor: "var(--status-accent)" }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13px] font-semibold ${
            tone === "waiting" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {label}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
          {when}
        </span>
      </span>
    </li>
  );
}

/** The centred line of small print each state closes with. */
function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-[18px] text-center text-xs leading-[1.5] text-muted-foreground">
      {children}
    </p>
  );
}
