"use client";

import { useTranslations } from "next-intl";

import {
  contactSummaryParts,
  type SavedAddressContact,
} from "./saved-address-format";

/**
 * A stop's contact details under its address: one dotted line of the short
 * fields, then the driver comment on its own line (it can run to 500
 * characters, so it is clamped rather than joined in). Renders nothing when no
 * contact detail was ever filled in.
 */
export function SavedAddressContactSummary({
  contact,
}: {
  contact: SavedAddressContact;
}) {
  const t = useTranslations("savedAddresses.contactSummary");
  const parts = contactSummaryParts(contact, t);
  const comment = contact.comment.trim();

  if (parts.length === 0 && comment === "") {
    return null;
  }

  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[12px] leading-relaxed text-muted">
      {parts.length > 0 ? (
        <p className="break-words">{parts.join(" · ")}</p>
      ) : null}
      {comment ? (
        <p className="line-clamp-2 break-words italic">
          {t("comment", { comment })}
        </p>
      ) : null}
    </div>
  );
}
