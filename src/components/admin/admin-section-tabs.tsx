"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AdminNavItem } from "@/components/admin/admin-nav";
import { cn } from "@/lib/utils";

/**
 * A section's tab strip.
 *
 * Rendered as `<Link>`s styled as tabs rather than with the shadcn `Tabs`
 * primitive: these tabs are *routes*, and `Tabs` swaps panels in client state,
 * which would lose deep-linking, back-button behavior and the server rendering
 * each tab's page does. The only thing this needs from the client is
 * `usePathname` to mark the active one.
 *
 * The item list is filtered by role upstream, in `admin-section-layout.tsx`.
 */
export function AdminSectionTabs({
  items,
}: {
  items: readonly AdminNavItem[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section"
      className="flex flex-wrap items-center gap-1 border-b border-border pb-2"
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
