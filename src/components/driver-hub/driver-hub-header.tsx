"use client";

import { HubOnlineToggle } from "@/components/driver-hub/hub-online-toggle";
import { Badge } from "@/components/ui/badge";
import type { HubAccount, HubAccountKind } from "@/lib/dashboard/hub/account";

/**
 * The chip's copy. A lookup rather than a `toLowerCase()` so the two words are
 * written out where a reviewer can read them, not derived from an enum.
 */
const ACCOUNT_KIND_LABELS: Record<HubAccountKind, string> = {
  BUSINESS: "Business",
  INDIVIDUAL: "Individual",
};

export type DriverHubHeaderProps = {
  account: HubAccount;
  /** The active nav entry's 20px page title. */
  title: string;
  /**
   * The 13px subhead: a screen's own derived string when it registered one via
   * `useHubSubtitle`, otherwise the nav entry's static fallback. Empty renders
   * nothing rather than an empty line.
   */
  subtitle: string;
};

/**
 * The hub's sticky top bar: page title and subhead on the left, account chip,
 * availability pill and avatar block on the right.
 *
 * The prototype puts a Business/Individual **segmented control** here. That is
 * a prototype affordance — it exists so one HTML file can demo both shapes of
 * the product. In the real app the account kind is derived from the session by
 * `resolveHubAccount()` and is the same fact the Drivers/Employees pages guard
 * on server-side, so a client-side switcher would be a control that either
 * lies (the pages still redirect) or grants screens the session does not
 * entitle the user to. Hence the static chip below. Do not re-add the switcher.
 */
export function DriverHubHeader({
  account,
  title,
  subtitle,
}: DriverHubHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-border bg-background px-8 py-[22px]">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-[-0.015em]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-[18px]">
        <Badge
          variant="outline"
          className="h-auto rounded-full px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground"
        >
          {ACCOUNT_KIND_LABELS[account.kind]}
        </Badge>

        {/* A company session has no availability to flip — `isOnline` is
            `null` for it, and the endpoint 403s a non-DRIVER outright — so the
            pill is absent rather than rendered in a permanently dead state. */}
        {account.isOnline !== null ? (
          <HubOnlineToggle
            isOnline={account.isOnline}
            canToggleOnline={account.canToggleOnline}
          />
        ) : null}

        <div className="flex items-center gap-2.5 border-l border-border pl-[18px]">
          <div
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-border text-[13px] font-semibold"
          >
            {account.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">
              {account.displayName}
            </p>
            {/* Mono, like every id, plate and figure on this surface. */}
            <p className="truncate font-price text-[11px] text-muted-foreground">
              {account.identifier}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
