import { NextResponse } from "next/server";
import { Workbook } from "exceljs";

import { adminNavSection } from "@/components/admin/admin-nav";
import { orderStatusLabel } from "@/components/orders-format";
import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import {
  MAX_EXPORT_ORDER_ROWS,
  getSalesOrders,
  getSalesSummary,
  resolveSalesRange,
  type SalesOrderRow,
  type SalesSummary,
} from "@/lib/admin/analytics";
import { authorizeAdminApi } from "@/lib/admin/api-auth";

/**
 * exceljs is a CommonJS package built on Node streams and zlib, so this route
 * has to run on the Node runtime rather than the edge one. That is already the
 * default, but stating it keeps a future project-wide `runtime = "edge"` from
 * breaking the download silently.
 */
export const runtime = "nodejs";

/** Excel's own currency mask — two decimals, thousands separated. */
const CURRENCY_FORMAT = "#,##0.00";

/**
 * Timestamps are written as real Excel dates so they stay sortable and
 * filterable; exceljs serialises them from the `Date`'s UTC value, which is
 * also how they are stored, so the sheet shows UTC.
 */
const TIMESTAMP_FORMAT = "yyyy-mm-dd hh:mm:ss";

/** The summary sheet: metric labels across the top, one row of values beneath. */
function addSummarySheet(
  workbook: Workbook,
  summary: SalesSummary,
  range: { fromParam: string; toParam: string },
  t: RequestTranslator,
): void {
  const sheet = workbook.addWorksheet(t("admin.analyticsExport.summarySheet"));

  sheet.columns = [
    // The range is written as text, not as a date: these are calendar-day
    // bounds, and letting Excel reinterpret them in the reader's locale is how
    // a report ends up claiming a range it was never run for.
    { header: t("common.shared.from"), key: "from", width: 12 },
    { header: t("common.shared.to"), key: "to", width: 12 },
    {
      header: t("admin.analyticsExport.turnoverAllOrders"),
      key: "turnover",
      width: 22,
      style: { numFmt: CURRENCY_FORMAT },
    },
    {
      header: t("admin.metricCards.revenueCompletedOrders"),
      key: "revenue",
      width: 26,
      style: { numFmt: CURRENCY_FORMAT },
    },
    { header: t("common.shared.completed"), key: "completedCount", width: 12 },
    {
      header: t("admin.metricCards.inProcess"),
      key: "inProcessCount",
      width: 12,
    },
    { header: t("common.shared.pending"), key: "pendingCount", width: 12 },
    { header: t("common.shared.cancelled"), key: "cancelledCount", width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    from: range.fromParam,
    to: range.toParam,
    turnover: summary.turnover,
    revenue: summary.revenue,
    completedCount: summary.completedCount,
    inProcessCount: summary.inProcessCount,
    pendingCount: summary.pendingCount,
    cancelledCount: summary.cancelledCount,
  });
}

/**
 * The detail sheet: every order the summary counted, so a reader can check a
 * total instead of taking it on trust. Truncated at `MAX_EXPORT_ORDER_ROWS`,
 * in which case the summary above still covers the whole range — hence the
 * warning row, so nobody re-adds the visible rows and concludes the totals are
 * wrong.
 */
function addOrdersSheet(
  workbook: Workbook,
  orders: SalesOrderRow[],
  t: RequestTranslator,
): void {
  const sheet = workbook.addWorksheet(t("admin.analyticsExport.ordersSheet"));

  sheet.columns = [
    { header: t("admin.analyticsExport.orderId"), key: "id", width: 28 },
    { header: t("common.shared.status"), key: "status", width: 14 },
    {
      header: t("common.shared.price"),
      key: "price",
      width: 12,
      style: { numFmt: CURRENCY_FORMAT },
    },
    {
      header: t("admin.analyticsExport.createdAtUtc"),
      key: "createdAt",
      width: 20,
      style: { numFmt: TIMESTAMP_FORMAT },
    },
    {
      header: t("admin.analyticsExport.completedAtUtc"),
      key: "completedAt",
      width: 20,
      style: { numFmt: TIMESTAMP_FORMAT },
    },
  ];

  sheet.getRow(1).font = { bold: true };
  // Keep the header in view while scrolling a long report.
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const order of orders) {
    // The enum value is the stored identifier; the sheet shows the reader's word for it.
    sheet.addRow({ ...order, status: orderStatusLabel(order.status, t) });
  }

  if (orders.length === MAX_EXPORT_ORDER_ROWS) {
    sheet.addRow({
      id: t("admin.analyticsExport.truncated", {
        count: MAX_EXPORT_ORDER_ROWS,
      }),
    });
  }
}

/**
 * GET /api/admin/analytics/export?from=YYYY-MM-DD&to=YYYY-MM-DD — the current
 * dashboard range as a downloadable `.xlsx`.
 *
 * It recomputes the figures through the same `getSalesSummary()` the page
 * rendered from rather than accepting them as query params: numbers that
 * arrive from the client are numbers a client can forge, and a spreadsheet
 * that disagrees with the screen is worse than no spreadsheet.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(
    adminNavSection("analytics").adminRoles,
  );

  if (!authorized.ok) {
    return authorized.response;
  }

  const { searchParams } = new URL(request.url);
  const range = resolveSalesRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const t = await getRequestTranslations();

  const [summary, orders] = await Promise.all([
    getSalesSummary(range),
    getSalesOrders(range),
  ]);

  const workbook = new Workbook();
  workbook.creator = "Back Office";
  workbook.created = new Date();

  addSummarySheet(workbook, summary, range, t);
  addOrdersSheet(workbook, orders, t);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Safe to interpolate: `resolveSalesRange` only ever returns params it
      // reformatted itself from a parsed date, so they are `YYYY-MM-DD` and
      // cannot carry quotes or newlines into the header.
      "Content-Disposition": `attachment; filename="sales-report-${range.fromParam}-to-${range.toParam}.xlsx"`,
      // A report is a point-in-time snapshot; a cached copy would quietly hand
      // back yesterday's figures for the same range.
      "Cache-Control": "no-store",
    },
  });
}
