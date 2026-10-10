import { Camera } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localeHref } from "@/i18n/server";
import { adminNavSection } from "@/components/admin/admin-nav";
import {
  ADMIN_ORDER_DATE_TIME_FORMAT,
  ADMIN_ORDER_STATUS_KEYS,
  ADMIN_ORDER_STATUS_TONE,
  formatGel,
} from "@/components/admin/orders/order-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_ORDER_STATUSES,
  ADMIN_ORDERS_MAX_QUERY_LENGTH,
  ADMIN_ORDERS_PAGE_SIZE,
  adminOrdersPageCount,
  adminOrdersQueryString,
  adminOrderTotalGel,
  buildAdminOrderWhere,
  parseAdminOrderFilters,
  type AdminOrderFilters,
} from "@/lib/admin/orders-filters";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/** Columns in the table, so the full-width empty row can span all of them. */
const COLUMN_COUNT = 8;

/**
 * Native `<select>` styled to sit beside the shadcn `Input`. Native rather than
 * the Radix `Select` because the filter is a plain GET form: a native control
 * submits its own value with no client JavaScript at all.
 */
const SELECT_CLASSES =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * `/admin/orders` — every order on the platform, newest first.
 *
 * A server component querying Prisma directly, with all state in the URL:
 * the filter is a GET form, pagination is plain links, so a filtered page is
 * shareable and the back button works without any client code. (The clients
 * list is a client component over a JSON route because it searches as you
 * type; this one searches on submit.)
 *
 * The role gate lives in `./layout.tsx`. The page is read-only, so there is no
 * mutation here to re-check.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAdminOrderFilters(await searchParams);
  const where = buildAdminOrderWhere(filters);

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * ADMIN_ORDERS_PAGE_SIZE,
      take: ADMIN_ORDERS_PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        createdAt: true,
        status: true,
        pickupAddress: true,
        dropoffAddress: true,
        price: true,
        serviceLevelAdjustment: true,
        overtimeFee: true,
        client: { select: { name: true, email: true } },
        vehicleTypeSpec: { select: { code: true, label: true } },
        _count: { select: { photos: true } },
      },
    }),
  ]);

  const pageCount = adminOrdersPageCount(total);
  const t = await getTranslations("admin.adminOrders");
  const tShared = await getTranslations("common.shared");
  // Root-scoped: the nav label and the status keys are full dotted paths.
  const tRoot = await getTranslations();
  const format = await getFormatter();
  const formAction = await localeHref("/admin/orders");
  const hasFilters = filters.query !== "" || filters.status !== null;

  const pageHref = (page: number): string =>
    `/admin/orders${adminOrdersQueryString({ ...filters, page } satisfies AdminOrderFilters)}`;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">
        {tRoot(adminNavSection("orders").labelKey)}
      </h1>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          action={formAction}
          method="get"
          role="search"
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
        >
          <Input
            type="search"
            name="q"
            defaultValue={filters.query}
            maxLength={ADMIN_ORDERS_MAX_QUERY_LENGTH}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="w-full sm:w-72"
          />
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            aria-label={t("filterByStatus")}
            className={cn(SELECT_CLASSES, "flex-1 sm:flex-none")}
          >
            <option value="">{t("allStatuses")}</option>
            {ADMIN_ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tRoot(ADMIN_ORDER_STATUS_KEYS[status])}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">
            {t("apply")}
          </Button>
          {hasFilters ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/orders">{t("clearFilters")}</Link>
            </Button>
          ) : null}
        </form>

        <p className="text-sm text-muted-foreground">
          {t("orderCount", { count: total })}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reference")}</TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("created")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {tShared("client")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {tShared("route")}
              </TableHead>
              <TableHead className="hidden xl:table-cell">
                {tShared("vehicle")}
              </TableHead>
              <TableHead>{tShared("status")}</TableHead>
              <TableHead className="text-right">{tShared("total")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                <span className="sr-only">{tShared("photos")}</span>
                <Camera aria-hidden className="ml-auto size-4" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {hasFilters ? t("noOrdersMatch") : t("noOrdersYet")}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const created = format.dateTime(
                  order.createdAt,
                  ADMIN_ORDER_DATE_TIME_FORMAT,
                );
                const photoCount = order._count.photos;

                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {order.reference}
                        </Link>
                        {/* What the hidden columns would have said, folded
                            under the reference on narrow screens. */}
                        <span className="text-xs text-muted-foreground lg:hidden">
                          {created}
                        </span>
                        <span className="max-w-48 truncate text-xs text-muted-foreground md:hidden">
                          {order.client.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {created}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex max-w-48 flex-col">
                        <span className="truncate">{order.client.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {order.client.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex max-w-64 flex-col text-xs">
                        <span className="truncate" title={order.pickupAddress}>
                          {order.pickupAddress}
                        </span>
                        <span
                          className="truncate text-muted-foreground"
                          title={order.dropoffAddress}
                        >
                          → {order.dropoffAddress}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {vehicleTypeSpecLabel(
                        order.vehicleTypeSpec.code,
                        order.vehicleTypeSpec.label,
                        tRoot,
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={ADMIN_ORDER_STATUS_TONE[order.status]}
                      >
                        {tRoot(ADMIN_ORDER_STATUS_KEYS[order.status])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatGel(adminOrderTotalGel(order))}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 tabular-nums",
                          photoCount === 0 && "text-muted-foreground",
                        )}
                        aria-label={t("photoCount", { count: photoCount })}
                      >
                        <Camera aria-hidden className="size-3.5" />
                        {photoCount}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <nav
          aria-label={t("pagination")}
          className="flex items-center justify-end gap-3"
        >
          <span className="text-sm text-muted-foreground">
            {tShared("pageOf", {
              page: Math.min(filters.page, pageCount),
              pageCount,
            })}
          </span>
          <PageLink
            // Clamped so a hand-typed `?page=99` past the end steps back onto
            // the last real page rather than to 98.
            href={pageHref(Math.min(filters.page - 1, pageCount))}
            disabled={filters.page <= 1}
            label={tShared("previous")}
          />
          <PageLink
            href={pageHref(filters.page + 1)}
            disabled={filters.page >= pageCount}
            label={tShared("next")}
          />
        </nav>
      ) : null}
    </div>
  );
}

/**
 * A previous/next control. A disabled one is a real disabled `<button>` rather
 * than a link with `aria-disabled`, so it is neither focusable nor followable.
 */
function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
