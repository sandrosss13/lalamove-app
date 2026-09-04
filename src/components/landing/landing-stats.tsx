import {
  DEFAULT_HOME_PAGE_CONTENT,
  type StatsContent,
} from "@/lib/admin/home-page-content";

/**
 * The figures strip: one card per authored stat, a large mono value over its
 * label.
 *
 * Every figure comes from the `stats` CMS content type and nothing is computed
 * or hardcoded here — the real service-coverage numbers are still unconfirmed
 * (see `specs/georgia-homepage-redesign/action-required.md`), so this component
 * renders whatever a content manager has put in and nothing else.
 */
export function LandingStats({
  content = DEFAULT_HOME_PAGE_CONTENT.stats,
}: {
  content?: StatsContent;
}) {
  return (
    <section className="px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]">
      {/*
        `auto-fit` + `minmax(180px, 1fr)` rather than a flex row: a wrapped flex
        item with `flex-grow: 1` inflates to the full row width, so four cards at
        a narrow viewport would render as three plus one full-width card. The
        grid also means the layout never depends on the item count, so an
        unfinished edit with fewer than four stats still looks deliberate.
      */}
      <dl className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[14px]">
        {content.items.map((item, index) => (
          <div
            // Authored list: the position is the only stable identity a stat
            // has, and two stats may legitimately share a label. Same key the
            // FAQ and how-it-works lists use.
            key={index}
            /*
              `flex-col-reverse` keeps the markup in the order HTML requires — a
              `<dt>` before its `<dd>` — while showing the value above its
              label. Assistive tech reads the honest pairing ("label: value")
              and the label text is not duplicated into a visually-hidden twin.
              `min-w-0` stops a long value from blowing out its grid track.
            */
            className="flex min-w-0 flex-col-reverse gap-[10px] rounded-[1.25rem] border border-line bg-surface px-[24px] py-[26px]"
          >
            <dt className="text-[13.5px] leading-[1.45] text-muted">
              {item.label}
            </dt>
            <dd className="font-price text-[clamp(30px,3.4vw,44px)] leading-none font-semibold tracking-[-0.04em] text-paper">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
