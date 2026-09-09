import { HubCard } from "@/components/driver-hub/hub-primitives";
import type { DriverAccountSectionId } from "@/components/driver-hub/driver-account-sections";

/**
 * The three rail sections the schema does not back: Notifications, Language and
 * Support.
 *
 * ## Why these are prose and not controls
 *
 * The design draws each of them as a destination, and the obvious way to fill
 * one is a switch, a radio group or a contact form. Every one of those would be
 * a control that appears to save and does not:
 *
 * - **Notifications** — there is no `NotificationPreference` model, and no
 *   `Notification` model either. The header's bell reads
 *   `SAMPLE_HEADER_NOTIFICATIONS`. A toggle here would have nothing to write
 *   to and nothing to govern.
 * - **Language** — there is no per-user locale column anywhere, and the app
 *   ships one language. A language picker would change nothing on this render
 *   or any later one.
 * - **Support** — there is no ticket model and no support address configured in
 *   this codebase. A "send us a message" form would drop what a driver typed at
 *   the moment they most needed it to arrive, and inventing an address here
 *   would send mail into a mailbox nobody has claimed.
 *
 * A switch that silently discards input is worse than an empty section, because
 * the driver walks away believing they have turned something off — and for
 * notifications and support specifically, they would find out they hadn't only
 * when a job or a complaint went missing. So each section says what it will do,
 * what has to exist first, and what the honest answer is today.
 *
 * ## No `<SampleNote />`
 *
 * `SampleNote` marks *fabricated data* rendered as if it were the driver's own
 * — it is what keeps a placeholder number from being mistaken for a real one.
 * Nothing on these panels is data at all: there is no value shown, real or
 * invented, only a statement about what is missing. Adding the badge would
 * imply there is something on screen to distrust.
 *
 * ## No status pill
 *
 * The hub's six-tone vocabulary (`hub-status.ts`) describes the state of a
 * *record* — a job, a document, a roster row. "This feature is not built" is
 * not a record state, and stamping "Pending" on the section would read as the
 * driver's notification settings being pending review. The copy carries it.
 *
 * A server component: it renders static copy and holds nothing.
 */

/** The three sections this panel serves — the ones with no schema behind them. */
export type DriverAccountPlaceholderSectionId = Extract<
  DriverAccountSectionId,
  "notifications" | "language" | "support"
>;

type PlaceholderCopy = {
  /** Card heading. */
  heading: string;
  /** What this section will do once it exists. */
  purpose: string;
  /** What has to be built first, named concretely. */
  gap: string;
  /** The honest answer for a driver who needs this today. */
  today: string;
};

const PLACEHOLDER_COPY: Record<
  DriverAccountPlaceholderSectionId,
  PlaceholderCopy
> = {
  notifications: {
    heading: "Notification preferences",
    purpose:
      "Choose which job offers, payout confirmations and account notices reach you, and whether they arrive in the app, by SMS or by email.",
    gap: "Nothing in the schema records a notification or a preference about one yet — not the offers, not the payouts, and nowhere a per-driver choice could be stored. The bell in the header shows placeholder rows for the same reason.",
    today:
      "Every driver currently gets every notice the app can send, and there is no setting that changes it. Rather than a switch that would forget what you chose, this section stays empty until there is something behind it.",
  },
  language: {
    heading: "Language",
    purpose:
      "Pick the language this dashboard, your job alerts and your payout notices are written in.",
    gap: "The app has no translations and no per-user locale column. There is one language to pick from, and no column to remember a pick in.",
    today:
      "Everything here is in English. A picker offering a choice that could not be honoured — or could not be remembered — would be worse than saying so.",
  },
  support: {
    heading: "Support",
    purpose:
      "Raise a problem with a job, a payout or your account, and follow it until somebody answers.",
    gap: "There is no support ticket model, no queue for one to land in, and no support address configured in this codebase.",
    today:
      "Use the contact route your fleet or the operations team gave you when your account was approved. A form here would take what you typed and have nowhere to put it, which is the worst possible failure for the one screen you reach when something has already gone wrong.",
  },
};

export function DriverAccountPlaceholderPanel({
  section,
}: {
  section: DriverAccountPlaceholderSectionId;
}) {
  const copy = PLACEHOLDER_COPY[section];

  return (
    <HubCard>
      <div>
        <h2 className="text-base font-semibold">{copy.heading}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {copy.purpose}
        </p>
      </div>

      <dl className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium tracking-[0.08em] uppercase text-muted-foreground">
            Why it is empty
          </dt>
          <dd className="text-[13px] leading-relaxed">{copy.gap}</dd>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium tracking-[0.08em] uppercase text-muted-foreground">
            What happens today
          </dt>
          <dd className="text-[13px] leading-relaxed">{copy.today}</dd>
        </div>
      </dl>
    </HubCard>
  );
}
