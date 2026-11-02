import { useTranslations } from "next-intl";

import { stopInfoRows, type StopInfo } from "@/lib/orders/stop-info";

/**
 * A stop's Contact Info under its address on the client's own pages (order
 * detail, checkout): the contact's name and phone on one line, then building,
 * entrance, floor, elevators and the comment, one labelled line each
 * (`stopInfoRows`). Every part is optional at booking, so each line is printed
 * only when it exists; `emptyLabel` (when given) is shown for a stop with
 * nothing at all, so a blank is not read as a fault.
 *
 * Landing tokens only (`text-muted`), like the panels it sits in. Works in a
 * server or a client component.
 */
export function StopContactLines({
  name,
  phone,
  info,
  emptyLabel,
}: {
  name: string | null;
  phone: string | null;
  info: StopInfo;
  emptyLabel?: string;
}) {
  const t = useTranslations("common.stopInfo");
  const rows = stopInfoRows(info, t);
  const who = [name, phone].filter(Boolean).join(" · ");

  if (who === "" && rows.length === 0) {
    return emptyLabel ? (
      <p className="mt-1 text-[13px] leading-snug text-muted">{emptyLabel}</p>
    ) : null;
  }

  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[13px] leading-snug text-muted">
      {who === "" ? null : <p>{who}</p>}
      {rows.map((row) => (
        <p
          key={row.key}
          className={
            row.multiline ? "break-words whitespace-pre-line" : "break-words"
          }
        >
          <span className="text-paper/80">{row.label}:</span> {row.value}
        </p>
      ))}
    </div>
  );
}
