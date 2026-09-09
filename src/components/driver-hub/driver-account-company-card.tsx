import { HubCard } from "@/components/driver-hub/hub-primitives";
import { DriverAccountDetailList } from "@/components/driver-hub/driver-account-detail-list";
import type { HubCompanyAccountSettings } from "@/lib/dashboard/hub/account-settings";

/**
 * "Profile details" for a fleet-owner session — the same slot the driver's
 * editable form fills, rendered read-only.
 *
 * ## Why a fleet's details are not editable here
 *
 * There is exactly one write path for company details, `POST
 * /api/logistics-company`, and it is not a plain save. Inside its transaction it
 * also clears `BusinessApplication.companyFlagReason` and resets
 * `companyReviewStatus` whenever the application is `ACTION_REQUIRED` with a
 * company-level flag on it, because *posting corrected details is the only
 * event that means "the company has responded to the flag"* — that write is
 * what stops the correction loop deadlocking, and the endpoint's own comments
 * say so at length.
 *
 * A "Save changes" button on an account screen does not carry that meaning. A
 * fleet owner who opened this panel, changed nothing and pressed save would
 * silently retract a compliance flag an admin had raised, and the admin would
 * have no record that nothing was actually corrected. So the correction flow
 * keeps its one entry point — the fleet onboarding wizard's step 1, which is
 * where a flagged company is sent — and this panel states where the change is
 * made rather than offering a second door into the same endpoint with different
 * intent behind it.
 *
 * The alternative — a form that posts a `?fromAccountScreen` variant the
 * endpoint would have to branch on — would put a compliance rule behind a query
 * parameter set by the caller. That is worse than a read-only panel.
 *
 * Password changes are unaffected: `DriverAccountPasswordCard` renders beside
 * this for a company session too, and Better Auth's `changePassword` is
 * role-agnostic.
 */

/** Where a fleet's registered details are actually corrected. */
const COMPANY_DETAILS_NOTE =
  "Your registered details are the ones operations verified when your fleet " +
  "was approved. They are corrected through the fleet application, so a change " +
  "is re-checked rather than taking effect unseen — contact support to reopen it.";

export function DriverAccountCompanyCard({
  settings,
}: {
  settings: HubCompanyAccountSettings;
}) {
  return (
    <HubCard>
      <div>
        <h2 className="text-base font-semibold">Company details</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          What a client is billed by, and how operations reaches your fleet.
        </p>
      </div>

      <DriverAccountDetailList
        className="mt-5"
        rows={[
          { label: "Company name", value: settings.companyName },
          { label: "VAT ID", value: settings.vatId, mono: true },
          { label: "Phone", value: settings.phone, mono: true },
          { label: "City", value: settings.city },
          {
            label: "Email",
            value: settings.email,
            note: "The address you sign in with.",
          },
          { label: "Registered address", value: settings.registeredAddress },
          { label: "Contact name", value: settings.contactName },
          { label: "Contact role", value: settings.contactRole },
          { label: "Contact email", value: settings.contactEmail },
        ]}
      />

      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        {COMPANY_DETAILS_NOTE}
      </p>
    </HubCard>
  );
}
