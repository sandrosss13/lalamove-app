"use client";

import type { LandingBanner } from "@/components/landing/landing-page";
import {
  HOME_ACCENT_LINK,
  HOME_CARD,
  HOME_CONTAINER,
  HOME_SECTION_HEADING,
} from "@/components/landing/landing-home-styles";
import { LandingLink, hasLink } from "@/components/landing/landing-link";
import { type OffersContent } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

/** One offer card's inner layout, shared by the linked and unlinked forms. */
function OfferCardBody({ offer }: { offer: LandingBanner }) {
  const title = offer.title.trim();
  const eyebrow = offer.eyebrow?.trim();
  const body = offer.body?.trim();
  const ctaLabel = offer.ctaLabel?.trim();

  return (
    <>
      <div className="relative h-[180px] bg-home-slot">
        {/* Plain <img>: CMS image URLs can point at any host, so they cannot
            be pinned in `remotePatterns`. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={offer.imageUrl}
          // The headline is optional, so the alt falls back through the card's
          // other copy; with none at all the image is decorative.
          alt={title || eyebrow || body || ""}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        {eyebrow ? (
          <span className="pointer-events-none absolute top-3.5 left-3.5 rounded-full bg-home-btn-bg px-2.5 py-1.5 font-price text-[10.5px] tracking-[0.14em] text-home-btn-fg uppercase">
            {eyebrow}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-[22px] pt-5 pb-[22px]">
        {/* No headline, no heading element: an empty <h3> is a blank stop
            for screen readers and leaves a gap above the body. */}
        {title ? (
          <h3 className="m-0 text-[18px] leading-[1.25] font-semibold tracking-[-0.02em]">
            {title}
          </h3>
        ) : null}
        {body ? (
          <p className="m-0 text-[14px] leading-[1.55] text-home-muted">
            {body}
          </p>
        ) : null}
        {offer.linkUrl && ctaLabel ? (
          <span className="mt-auto pt-2.5 text-[14px] font-semibold text-home-accent-ink">
            {ctaLabel} →
          </span>
        ) : null}
      </div>
    </>
  );
}

/**
 * "Offers and news": a row of cards, one per active `Banner` at placement
 * `home_secondary`. Each banner carries its own tag (`eyebrow`), title, body,
 * button label and link; a card without a link is not clickable.
 *
 * Renders nothing when no offer banners are live — the heading alone would
 * announce a list that is not there.
 */
export function LandingOffers({
  content,
  offers,
}: {
  content: OffersContent;
  offers: LandingBanner[];
}) {
  if (offers.length === 0) {
    return null;
  }

  const cardClasses = cn(HOME_CARD, "flex flex-col text-home-ink");

  return (
    <section
      id="offers"
      className={cn(HOME_CONTAINER, "scroll-mt-28 pt-[clamp(48px,6vw,80px)]")}
    >
      <div
        data-reveal
        className="mb-6 flex flex-wrap items-end justify-between gap-4"
      >
        <h2 className={HOME_SECTION_HEADING}>{content.heading}</h2>
        {hasLink(content.linkLabel, content.linkHref) ? (
          <LandingLink
            href={content.linkHref ?? ""}
            className={HOME_ACCENT_LINK}
          >
            {content.linkLabel} →
          </LandingLink>
        ) : null}
      </div>
      <ul
        data-reveal
        className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]"
      >
        {offers.map((offer) => (
          <li key={offer.id} className="flex">
            {offer.linkUrl ? (
              <LandingLink
                href={offer.linkUrl}
                className={cn(
                  cardClasses,
                  "w-full transition-shadow hover:shadow-home-lift",
                )}
              >
                <OfferCardBody offer={offer} />
              </LandingLink>
            ) : (
              <div className={cn(cardClasses, "w-full")}>
                <OfferCardBody offer={offer} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
