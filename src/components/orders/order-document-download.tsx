import type { OrderStatus } from "@prisma/client";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { LOCALES, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Whether an order in `status` has an order-details PDF at all: not before
 *  it is paid, and not once it is called off — the gate the PDF route applies. */
export function isOrderDocumentAvailable(status: OrderStatus): boolean {
  return status !== "INITIATED" && status !== "CANCELLED";
}

/** Each document language's name, in the page's language (`common` does the
 *  same for its language labels). */
const LANGUAGE_KEY = {
  ka: "languageKa",
  en: "languageEn",
} as const satisfies Record<AppLocale, string>;

/**
 * The client-facing surfaces' panel and button classes (landing palette), and
 * the back office's (shadcn tokens — see the note in `ui/button.tsx`).
 */
const SURFACE = {
  client: {
    panel: "rounded-xl border border-line bg-surface p-5",
    heading: "font-display text-base font-semibold text-paper",
    description: "mt-1 text-[13px] leading-snug text-muted",
    primary:
      "inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-ink transition-transform hover:-translate-y-0.5",
    secondary:
      "inline-flex items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent",
  },
  admin: {
    panel: "flex flex-col gap-2 rounded-xl border border-border p-4",
    heading: "text-sm font-semibold",
    description: "text-sm text-muted-foreground",
    primary: buttonVariants({ variant: "default" }),
    secondary: buttonVariants({ variant: "outline" }),
  },
} as const;

/**
 * The "Order details" PDF download: one link per language, the page's own
 * locale first (and emphasised) so the default is one tap away.
 *
 * Shared by every surface that offers the document — the client's order and
 * tracking pages, a guest's `/track/[token]` link and the admin order page.
 * Each page has already decided the reader may see the order; who may download
 * it is the PDF route's call (`GET /api/orders/[id]/waybill/pdf`). Renders
 * nothing while the order has no document (`isOrderDocumentAvailable`).
 *
 * Plain `<a download>` links: the route answers with the PDF as an attachment,
 * so there is nothing to fetch or hold in state. A guest has no session, so
 * their token rides along as `&token=`, the same way the live map's location
 * poll carries it.
 */
export function OrderDocumentDownload({
  orderId,
  status,
  guestToken,
  surface = "client",
  className,
}: {
  orderId: string;
  status: OrderStatus;
  /** The guest route's token, for a reader without a session or cookie. */
  guestToken?: string;
  surface?: keyof typeof SURFACE;
  /** Replaces the surface's panel classes, to match a page's own cards. */
  className?: string;
}) {
  const t = useTranslations("orderDocument.download");
  const locale = useLocale() as AppLocale;

  if (!isOrderDocumentAvailable(status)) {
    return null;
  }

  const classes = SURFACE[surface];
  const languages = [locale, ...LOCALES.filter((lang) => lang !== locale)];
  const href = (lang: AppLocale) =>
    `/api/orders/${encodeURIComponent(orderId)}/waybill/pdf?lang=${lang}` +
    (guestToken ? `&token=${encodeURIComponent(guestToken)}` : "");

  return (
    <section
      aria-labelledby="order-document-download-heading"
      className={className ?? classes.panel}
    >
      <h2 id="order-document-download-heading" className={classes.heading}>
        {t("title")}
      </h2>
      <p className={classes.description}>{t("description")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {languages.map((lang, index) => (
          <a
            key={lang}
            href={href(lang)}
            download
            aria-label={t("downloadIn", { language: t(LANGUAGE_KEY[lang]) })}
            className={cn(
              "min-w-0 flex-1 sm:flex-none",
              index === 0 ? classes.primary : classes.secondary,
            )}
          >
            <Download aria-hidden="true" className="size-4" />
            {t(LANGUAGE_KEY[lang])}
          </a>
        ))}
      </div>
    </section>
  );
}
