"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AdminHomePageSectionRow } from "@/app/api/admin/content/home-page-sections/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PINNED_UNDER_HERO } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

import type { PartitionedSections } from "./shared";

export type SectionListProps = {
  sections: PartitionedSections;
  selectedId: string | null;
  /** A list-level write (toggle, reorder) is in flight. */
  busy: boolean;
  labelFor: (section: AdminHomePageSectionRow) => string;
  summaryFor: (section: AdminHomePageSectionRow) => string;
  onSelect: (section: AdminHomePageSectionRow) => void;
  onToggle: (section: AdminHomePageSectionRow) => void;
  /** Moves a reorderable section one place among the reorderable ones. */
  onMove: (section: AdminHomePageSectionRow, direction: -1 | 1) => void;
  onDeleteRetired: (section: AdminHomePageSectionRow) => void;
};

/** A fixed chrome row (header or footer): selectable, never moved or hidden. */
function ChromeRow({
  label,
  section,
  selected,
  onSelect,
}: {
  label: string;
  section: AdminHomePageSectionRow | null;
  selected: boolean;
  onSelect: (section: AdminHomePageSectionRow) => void;
}) {
  const t = useTranslations("admin.homePageCms");
  const content = (
    <>
      <span className="w-[22px] shrink-0 font-mono text-[11px]">—</span>
      <span
        className={cn(
          "flex-1 text-left",
          selected && "font-semibold text-foreground",
        )}
      >
        {label}
      </span>
      <Badge variant="outline">{t("fixed")}</Badge>
    </>
  );
  const className = cn(
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground",
    selected && "bg-accent shadow-[inset_3px_0_0_var(--foreground)]",
  );

  // Without a row (materialize has not run) the header is only a marker.
  return section ? (
    <button
      type="button"
      className={cn(className, "hover:bg-secondary/60")}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(section)}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

/**
 * The left-hand pane: the page's sections in running order between the fixed
 * header and footer rows, each with a visibility checkbox and ↑/↓ — except the
 * booking card, which the renderer pins under the hero and so is shown fixed
 * there. Sections v4 no longer renders sit in a collapsed group at the end.
 */
export function SectionList({
  sections,
  selectedId,
  busy,
  labelFor,
  summaryFor,
  onSelect,
  onToggle,
  onMove,
  onDeleteRetired,
}: SectionListProps) {
  const t = useTranslations("admin.homePageCms");
  const [showRetired, setShowRetired] = useState(false);

  const movable = sections.body.filter(
    (section) => section.type !== PINNED_UNDER_HERO,
  );
  const visibleCount = sections.body.filter(
    (section) => section.isActive,
  ).length;

  return (
    <div className="min-w-0 flex-[1_1_20rem] overflow-hidden rounded-xl border border-border bg-card lg:max-w-[26rem]">
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
        <span className="text-[13px] font-semibold">{t("sections")}</span>
        <span className="text-xs text-muted-foreground">
          {t("visibleCount", {
            visible: visibleCount,
            total: sections.body.length,
          })}
        </span>
      </div>

      <div className="border-b border-border">
        <ChromeRow
          label={t("sectionNames.nav")}
          section={sections.nav}
          selected={sections.nav !== null && sections.nav.id === selectedId}
          onSelect={onSelect}
        />
      </div>

      {sections.body.map((section, index) => {
        const selected = section.id === selectedId;
        const pinned = section.type === PINNED_UNDER_HERO;
        const movableIndex = movable.findIndex((row) => row.id === section.id);
        const label = labelFor(section);

        return (
          <div
            key={section.id}
            className={cn(
              "flex items-center gap-2.5 border-b border-border py-2.5 pr-4",
              pinned ? "pl-[34px]" : "pl-4",
              selected
                ? "bg-accent shadow-[inset_3px_0_0_var(--foreground)]"
                : "hover:bg-secondary/60",
            )}
          >
            <span className="w-[22px] shrink-0 font-mono text-[11px] text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Checkbox
              checked={section.isActive}
              disabled={busy}
              aria-label={
                section.isActive
                  ? t("hideSection", { name: label })
                  : t("showSection", { name: label })
              }
              onCheckedChange={() => onToggle(section)}
            />
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(section)}
            >
              <span
                className={cn(
                  "text-sm",
                  selected ? "font-semibold" : "font-medium",
                  section.isActive
                    ? "text-foreground"
                    : "text-muted-foreground line-through",
                )}
              >
                {label}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {summaryFor(section)}
              </span>
            </button>
            {pinned ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {t("underHero")}
              </span>
            ) : (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={busy || movableIndex <= 0}
                  aria-label={t("moveSectionUp", { name: label })}
                  onClick={() => onMove(section, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={busy || movableIndex === movable.length - 1}
                  aria-label={t("moveSectionDown", { name: label })}
                  onClick={() => onMove(section, 1)}
                >
                  ↓
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <ChromeRow
        label={t("sectionNames.footer")}
        section={sections.footer}
        selected={sections.footer !== null && sections.footer.id === selectedId}
        onSelect={onSelect}
      />

      {sections.retired.length > 0 ? (
        <div className="border-t border-border bg-muted/40">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showRetired}
            onClick={() => setShowRetired((open) => !open)}
          >
            <span>
              {t("retiredSections", { count: sections.retired.length })}
            </span>
            <span aria-hidden>{showRetired ? "▾" : "▸"}</span>
          </button>
          {showRetired ? (
            <div className="flex flex-col">
              <p className="px-4 pb-2 text-xs text-muted-foreground">
                {t("retiredSectionsHint")}
              </p>
              {sections.retired.map((section) => (
                <div
                  key={section.id}
                  className="flex items-center gap-2.5 border-t border-border px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {labelFor(section)}
                  </span>
                  <Badge variant="outline">
                    {section.isActive ? t("visible") : t("hidden")}
                  </Badge>
                  {section.isActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => onToggle(section)}
                    >
                      {t("hide")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDeleteRetired(section)}
                  >
                    {t("delete")}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
