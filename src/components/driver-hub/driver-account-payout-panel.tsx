import { HubCard, SampleNote } from "@/components/driver-hub/hub-primitives";
import { DriverAccountDetailList } from "@/components/driver-hub/driver-account-detail-list";
import type { HubAccountSettings } from "@/lib/dashboard/hub/account-settings";
import { SAMPLE_PAYOUT_ACCOUNT } from "@/lib/dashboard/hub/sample";

/**
 * "Payout & bank details" — where a driver's fares are settled, and when.
 *
 * ## What is real here, and what is not
 *
 * **There is no driver bank account in this schema.** `DriverProfile` records
 * identity, city, activation and location; nothing financial. The one bank
 * column that exists anywhere is `LogisticsCompany.bankAccountIban`, collected
 * by the fleet onboarding wizard, and it belongs to a fleet. So this panel has
 * two shapes:
 *
 * - **A BUSINESS session** sees its own real IBAN, truncated to its last four
 *   characters in the server loader so the full number never reaches the
 *   browser. That row carries no `<SampleNote />`, because it is the fleet's
 *   own stored value.
 * - **An INDEPENDENT driver** has nothing real to show, so the whole account
 *   block is `SAMPLE_PAYOUT_ACCOUNT` and carries the note.
 *
 * The **schedule is sampled for both**. No `Payout` model exists, nothing in
 * this codebase runs on a Friday, and a cadence is not derivable from any
 * column — so "Weekly · every Friday" is fiction even on the screen whose IBAN
 * is fact, and it is marked as such separately rather than being covered by the
 * account block's note. Two notes rather than one because the two halves are
 * true to different degrees for a fleet, and a single note at the top of the
 * card would have to overclaim or underclaim one of them.
 *
 * ## No form
 *
 * Changing a payout account is the highest-value target on any driver-facing
 * surface, and there is nothing behind this screen to write to for a driver and
 * nothing that would verify the change for a fleet. A form here would either
 * discard what was typed or move a fleet's money without a check, so the panel
 * states how the change is actually made instead. `driver-account-company-card.tsx`
 * makes the same call about the fleet's other registered details, for the same
 * reason at lower stakes.
 *
 * ## Not rendered for a ROSTER driver at all
 *
 * An employed driver is paid by their employer — the company claims the order
 * and is settled for it; `Order.driverId` only records who drove. They have no
 * payout account of their own and no schedule of their own, so the section is
 * absent from their rail (`driver-account-sections.ts`) and their `?section=`
 * request is redirected server-side (`page.tsx`). This component is therefore
 * never reached by that persona, which is why it has no roster branch: it
 * would be unreachable code asserting something that is already impossible.
 * Same rule, same reasoning and the same pair of enforcement points as
 * `/dashboard/earnings`.
 */

/** What changing a payout account actually requires today. */
const CHANGE_NOTE =
  "A payout account is changed through support so the new account can be " +
  "verified against your registered details before any money moves.";

/** Names the schema gap on the sampled rows. */
const SAMPLE_ACCOUNT_NOTE =
  "No driver payout account exists in the schema — this is placeholder data, not your bank details.";

const SAMPLE_SCHEDULE_NOTE =
  "No payout schedule exists in the schema — no Payout model records when a settlement ran or is due.";

export function DriverAccountPayoutPanel({
  settings,
}: {
  settings: HubAccountSettings;
}) {
  // A fleet's own IBAN is real; a driver has no bank column to read, so the
  // sampled account stands in. `null` for a fleet that never completed the
  // wizard's payout step is a third, honest state: real, and really empty.
  const isCompany = settings.shape === "COMPANY";
  const realIbanLast4 = isCompany ? settings.payoutIbanLast4 : null;
  const usesSampleAccount = !isCompany;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <HubCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Payout account</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {isCompany
                ? "Where order revenue is settled to your fleet."
                : "Where your fares are settled."}
            </p>
          </div>
          {usesSampleAccount ? <SampleNote note={SAMPLE_ACCOUNT_NOTE} /> : null}
        </div>

        <DriverAccountDetailList
          className="mt-5"
          rows={
            usesSampleAccount
              ? [
                  { label: "Bank", value: SAMPLE_PAYOUT_ACCOUNT.bankName },
                  {
                    label: "IBAN",
                    value: `•••• ${SAMPLE_PAYOUT_ACCOUNT.ibanLast4}`,
                    mono: true,
                  },
                ]
              : [
                  {
                    label: "IBAN",
                    value:
                      realIbanLast4 === null ? null : `•••• ${realIbanLast4}`,
                    mono: realIbanLast4 !== null,
                    note:
                      realIbanLast4 === null
                        ? "Your fleet application did not record a payout account."
                        : "The account your fleet registered.",
                  },
                ]
          }
        />

        <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          {CHANGE_NOTE}
        </p>
      </HubCard>

      <HubCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Payout schedule</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              How often completed jobs are settled.
            </p>
          </div>
          {/* Sampled for every persona, including the fleet whose IBAN above
              is real — see the note at the top of this file. */}
          <SampleNote note={SAMPLE_SCHEDULE_NOTE} />
        </div>

        <DriverAccountDetailList
          className="mt-5"
          rows={[
            { label: "Frequency", value: SAMPLE_PAYOUT_ACCOUNT.cadenceLabel },
            {
              label: "Next payout",
              value: SAMPLE_PAYOUT_ACCOUNT.nextPayoutLabel,
            },
          ]}
        />
      </HubCard>
    </div>
  );
}
