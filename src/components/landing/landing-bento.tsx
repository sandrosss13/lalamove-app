import Link from "next/link";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  type BentoCard,
  type BentoContent,
} from "@/lib/admin/home-page-content";

/**
 * Chrome and type scale shared by every small card in both rows. Kept as
 * constants rather than repeated inline, the same way `landing-quote-calculator`
 * shares its field classes — the landing page uses no shadcn primitives, so a
 * repeated class string is the only thing holding these cards to one look.
 */
const CARD_CLASSES =
  "rounded-3xl border border-line bg-surface p-[clamp(24px,2.6vw,32px)]";

const CARD_EYEBROW_CLASSES =
  "font-price text-[10.5px] tracking-[.18em] text-faint uppercase";

const CARD_TITLE_CLASSES =
  "mt-3.5 font-display text-[18px] leading-snug font-semibold tracking-[-.02em] text-paper";

const CARD_BODY_CLASSES =
  "mt-2 text-[14.5px] leading-[1.6] text-muted text-pretty";

/**
 * One small bento card, used by both the row A stack and the row B grid so the
 * two rows can never drift apart visually.
 *
 * `linkLabel` / `linkHref` are optional in the contract and most cards omit
 * them; a card is only a link when both halves are authored, since a label with
 * no destination and a destination with no label are both unrenderable.
 */
function LandingBentoCard({ card }: { card: BentoCard }) {
  const { linkLabel, linkHref } = card;
  const linkClasses =
    "font-display text-[14px] font-semibold text-accent transition-colors hover:text-accent-hover";

  return (
    <li className={`${CARD_CLASSES} flex-1`}>
      <p className={CARD_EYEBROW_CLASSES}>{card.eyebrow}</p>
      <h3 className={CARD_TITLE_CLASSES}>{card.title}</h3>
      <p className={CARD_BODY_CLASSES}>{card.body}</p>
      {linkLabel && linkHref ? (
        <p className="mt-4">
          {/* Same split as the footer: in-app paths go through `next/link` for
              client navigation, anything else stays a plain anchor because the
              href is CMS-authored and may point off-site. */}
          {linkHref.startsWith("/") ? (
            <Link href={linkHref} className={linkClasses}>
              {linkLabel}
            </Link>
          ) : (
            <a href={linkHref} className={linkClasses}>
              {linkLabel}
            </a>
          )}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The bento feature grid.
 *
 * `content` comes from the matching `HomePageSection` row when one exists, and
 * falls back to the seeded defaults when the locale has no rows yet.
 *
 * The design has no separate section header above the grid: the section's
 * `eyebrow` / `heading` / `body` are the copy of the large accent-tinted card
 * itself, which is why that card carries the section's `<h2>` (at the card type
 * scale the design specifies) and every other card sits under it as an `<h3>`.
 *
 * The mock tracking panel depicts a fictional order. It is product art, not
 * status, so the whole panel is `aria-hidden` — reading out a fake order id and
 * ETA is worse for a screen reader than saying nothing at all.
 */
export function LandingBento({
  content = DEFAULT_HOME_PAGE_CONTENT.bento,
}: {
  content?: BentoContent;
}) {
  const { trackingPanel } = content;

  // `content` is a free-form `Json` column that can be edited straight in the
  // database, so the percentage is clamped here rather than trusted: a negative
  // or >100 width would paint outside the track, and a non-finite one would
  // drop an invalid `width` declaration and leave the bar full-width.
  const progressPercent = Number.isFinite(trackingPanel.progressPercent)
    ? Math.min(100, Math.max(0, trackingPanel.progressPercent))
    : 0;

  return (
    <section className="px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[14px]">
        {/* Row A is a two-item asymmetric split, not an equal-width card row,
            so flex-wrap is correct here: a wrapped item going full width is
            exactly the intended stacked behaviour. */}
        <div data-reveal className="flex flex-wrap gap-[14px]">
          <article className="flex min-w-0 flex-[1_1_420px] flex-col rounded-3xl border border-line-accent bg-[image:var(--landing-gradient-accent-card)] p-[clamp(26px,3vw,38px)]">
            <p className="font-price text-[10.5px] tracking-[.18em] text-accent uppercase">
              {content.eyebrow}
            </p>
            <h2 className="mt-[18px] max-w-[22ch] font-display text-[clamp(22px,2.5vw,32px)] leading-[1.12] font-semibold tracking-[-.03em] text-balance text-paper">
              {content.heading}
            </h2>
            <p className="mt-3 mb-[26px] max-w-[44ch] text-[15px] leading-[1.6] text-pretty text-subtle">
              {content.body}
            </p>

            <div
              aria-hidden="true"
              className="mt-auto rounded-2xl border border-line-strong bg-surface-sunken px-5 py-[18px]"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[14px] text-subtle">
                  {trackingPanel.orderLabel}
                </span>
                <span className="font-price text-[14px] text-accent">
                  {trackingPanel.etaLabel}
                </span>
              </div>

              <div className="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-line-strong">
                {/* The sole inline style in this section: a runtime number
                    cannot become a Tailwind class. Every colour, radius and
                    height around it stays a utility. */}
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
                <span className="min-w-0 truncate">
                  {trackingPanel.fromLabel}
                </span>
                <span className="shrink-0 text-accent">&rarr;</span>
                <span className="min-w-0 truncate">
                  {trackingPanel.toLabel}
                </span>
              </div>
            </div>
          </article>

          {/* Mapped, never indexed: a content manager saving one card or three
              must not crash the page or silently lose a card. */}
          <ul className="flex min-w-0 flex-[1_1_300px] flex-col gap-[14px]">
            {content.sideCards.map((card, index) => (
              // Position, not title: two cards are free to share a title, and
              // the list is static for the lifetime of the render.
              <LandingBentoCard key={index} card={card} />
            ))}
          </ul>
        </div>

        {/* Row B is an equal-width card row, so it is a grid: a wrapped flex
            item with `flex-grow: 1` inflates to the full row width and reads as
            a broken layout. */}
        <ul
          data-reveal
          className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
        >
          {content.rowCards.map((card, index) => (
            // Position, not title: see the row A stack above.
            <LandingBentoCard key={index} card={card} />
          ))}
        </ul>
      </div>
    </section>
  );
}
