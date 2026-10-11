"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NavLink } from "@/lib/admin/home-page-content";

import { moveAt, removeAt, replaceAt } from "./shared";

/** A labelled single-line field. `wide` spans the whole editor grid. */
export function TextField({
  id,
  label,
  value,
  hint,
  wide = false,
  type = "text",
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  wide?: boolean;
  type?: "text" | "number" | "url";
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5", wide && "col-span-full")}
    >
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A labelled multi-line field, for body copy. Always spans the grid. */
export function TextAreaField({
  id,
  label,
  value,
  rows = 3,
  hint,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  rows?: number;
  hint?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="col-span-full flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * The editor's responsive field grid: one column on a narrow pane, as many
 * ~260px columns as fit on a wide one — the artboard's `auto-fit` grid.
 */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-3.5">
      {children}
    </div>
  );
}

/** A muted explanatory panel, for what an editor does *not* control. */
export function EditorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted px-3.5 py-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * The heading row above an inline list: its name, an `N / max` count badge
 * (secondary once full), and the add button.
 */
export function ListHeader({
  label,
  countLabel,
  full,
  addLabel,
  addDisabled,
  onAdd,
}: {
  label: string;
  countLabel: string;
  full: boolean;
  addLabel: string;
  addDisabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <Badge variant={full ? "secondary" : "outline"}>{countLabel}</Badge>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={addDisabled}
        onClick={onAdd}
      >
        {addLabel}
      </Button>
    </div>
  );
}

/**
 * Framing for one entry of a repeatable content list (a step, a city, a
 * question): `#n`, its title, ↑/↓ and Remove, then the entry's own fields.
 *
 * The move buttons take their `aria-label` from `title`, which already names
 * the entry and its position — an editor with several lists cannot afford a
 * dozen identical "Move up" buttons.
 */
export function RepeatableEntry({
  number,
  title,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  children,
}: {
  number: number;
  title: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border px-3.5 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          #{number}
        </span>
        <span className="min-w-0 flex-[1_1_7.5rem] truncate text-sm font-medium">
          {title || t("untitled")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canMoveUp}
          aria-label={t("moveItemUp", { number })}
          onClick={onMoveUp}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canMoveDown}
          aria-label={t("moveItemDown", { number })}
          onClick={onMoveDown}
        >
          ↓
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
      </div>
      <div className="p-3.5">
        <FieldGrid>{children}</FieldGrid>
      </div>
    </div>
  );
}

/**
 * A generic repeatable list: header with count and add, then one
 * `RepeatableEntry` per item. Owns the move/remove/add bookkeeping so each
 * section editor only describes an entry's fields.
 */
export function RepeatableList<Item>({
  label,
  addLabel,
  items,
  max,
  blank,
  titleOf,
  onChange,
  renderFields,
}: {
  label: string;
  addLabel: string;
  items: readonly Item[];
  /** Cap from the design; omitted for lists the design leaves open. */
  max?: number;
  blank: () => Item;
  titleOf: (item: Item) => string;
  onChange: (next: Item[]) => void;
  renderFields: (
    item: Item,
    index: number,
    update: (next: Item) => void,
  ) => React.ReactNode;
}) {
  const full = max !== undefined && items.length >= max;

  return (
    <div className="flex flex-col gap-3">
      <ListHeader
        label={label}
        countLabel={
          max === undefined ? String(items.length) : `${items.length} / ${max}`
        }
        full={full}
        addLabel={addLabel}
        addDisabled={full}
        onAdd={() => onChange([...items, blank()])}
      />
      {items.map((item, index) => (
        <RepeatableEntry
          // Position: two entries may share a title, and the list is only ever
          // edited through these controls.
          key={index}
          number={index + 1}
          title={titleOf(item)}
          canMoveUp={index > 0}
          canMoveDown={index < items.length - 1}
          onMoveUp={() => onChange(moveAt(items, index, -1))}
          onMoveDown={() => onChange(moveAt(items, index, 1))}
          onRemove={() => onChange(removeAt(items, index))}
        >
          {renderFields(item, index, (next) =>
            onChange(replaceAt(items, index, next)),
          )}
        </RepeatableEntry>
      ))}
    </div>
  );
}

/** A list of `{ label, href }` links — nav links, utility links, legal links. */
export function LinkListField({
  idPrefix,
  label,
  addLabel,
  links,
  onChange,
}: {
  idPrefix: string;
  label: string;
  addLabel: string;
  links: readonly NavLink[];
  onChange: (next: NavLink[]) => void;
}) {
  const t = useTranslations("admin.homePageCms");

  return (
    <RepeatableList
      label={label}
      addLabel={addLabel}
      items={links}
      blank={() => ({ label: "", href: "" })}
      titleOf={(link) => link.label}
      onChange={onChange}
      renderFields={(link, index, update) => (
        <>
          <TextField
            id={`${idPrefix}-${index}-label`}
            label={t("linkText")}
            value={link.label}
            onChange={(next) => update({ ...link, label: next })}
          />
          <TextField
            id={`${idPrefix}-${index}-href`}
            label={t("link")}
            value={link.href}
            onChange={(href) => update({ ...link, href })}
          />
        </>
      )}
    />
  );
}
