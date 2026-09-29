import { NextResponse } from "next/server";

import type { AdminRole, CompanyReviewStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";
import { COMPANY_FLAG_REASONS } from "@/lib/review-flag-reasons";

/**
 * Staff who may review business fleet applications. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/** The reviewer's verdict on the company block as a whole. */
type CompanyVerdict =
  { verdict: "VERIFIED" } | { verdict: "FLAGGED"; reason: string };

/** Body this endpoint answers with, so the review drawer can update in place. */
export type AdminBusinessCompanyReviewResponse = {
  companyReviewStatus: CompanyReviewStatus;
  companyFlagReason: string | null;
};

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `reason` is required for a flag, rejected when whitespace-only, and rejected
 * when it is not one of `COMPANY_FLAG_REASONS` — see that constant for why the
 * list is closed rather than free text.
 */
function parseCompanyVerdictBody(
  body: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
): { value: CompanyVerdict } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const { verdict, reason } = body as Record<string, unknown>;

  if (verdict === "VERIFIED") {
    return { value: { verdict: "VERIFIED" } };
  }

  if (verdict !== "FLAGGED") {
    return {
      error: t(
        "errors.adminBusinessApplicationsCompany.verdictMustBeVerifiedOrFlagged",
      ),
    };
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    return {
      error: t(
        "errors.adminBusinessApplicationsCompany.aReasonIsRequiredToFlag",
      ),
    };
  }

  const trimmedReason = reason.trim();

  if (!COMPANY_FLAG_REASONS.includes(trimmedReason)) {
    return {
      error: t("errors.adminBusinessApplicationsCompany.thatIsNotOneOfThe"),
    };
  }

  return { value: { verdict: "FLAGGED", reason: trimmedReason } };
}

/**
 * PATCH /api/admin/business-applications/[id]/company — record the reviewer's
 * verdict on the company block (legal entity, VAT ID, address, bank details,
 * contact person).
 *
 * A verdict and nothing else: this endpoint does **not** touch
 * `BusinessApplication.status`. Verifying the company is one input to
 * activation, not activation itself — the reviewer works through the company
 * block and every vehicle card, then makes one of the two terminal decisions
 * through the sibling `request-changes`/`activate` endpoints.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseCompanyVerdictBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const application = await prisma.businessApplication.findUnique({
    where: { id },
    select: { id: true, status: true, companyId: true },
  });

  // A `DRAFT` application is indistinguishable from a non-existent one at this
  // endpoint: it was never submitted, so it is not in the review queue and
  // there is nothing here for a reviewer to have opened. Answering identically
  // also stops the response confirming that some id is a real company's
  // in-progress draft.
  if (!application || application.status === "DRAFT") {
    return NextResponse.json(
      { error: t("common.shared.applicationNotFound") },
      { status: 404 },
    );
  }

  // `APPROVED` is terminal for this feature, so re-reviewing the company block
  // is a stale tab, not a 404 — say so.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: t("common.shared.thisFleetHasAlreadyBeenActivated") },
      { status: 400 },
    );
  }

  const review = parsed.value;

  const updated = await prisma.businessApplication.update({
    where: { id },
    data:
      review.verdict === "VERIFIED"
        ? // Cleared, not left behind: a verified company still showing a stale
          // reason would keep its status screen asking for a correction.
          { companyReviewStatus: "VERIFIED", companyFlagReason: null }
        : { companyReviewStatus: "FLAGGED", companyFlagReason: review.reason },
    select: { companyReviewStatus: true, companyFlagReason: true },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action:
      review.verdict === "VERIFIED"
        ? "business_application.company_verify"
        : "business_application.company_flag",
    entityType: "BusinessApplication",
    entityId: id,
    metadata: {
      companyId: application.companyId,
      ...(review.verdict === "FLAGGED" ? { reason: review.reason } : {}),
    },
  });

  const body: AdminBusinessCompanyReviewResponse = {
    companyReviewStatus: updated.companyReviewStatus,
    companyFlagReason: updated.companyFlagReason,
  };

  return NextResponse.json(body, { status: 200 });
}
