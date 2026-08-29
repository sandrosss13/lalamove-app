import { NextResponse } from "next/server";

import type { AdminRole, CompanyReviewStatus } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may review business fleet applications. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/**
 * The four company-level flag reasons from the design, verbatim. Unlike the
 * driver-document endpoint, which accepts any non-empty string, this is a
 * closed list: the company reads the reason verbatim on its status screen and
 * the "Action required" screen keys its corrective copy off it, so a
 * free-typed reason would produce a screen with nothing actionable on it. The
 * drawer offers exactly these four as chips, and a chip click *is* the flag.
 */
const COMPANY_FLAG_REASONS: readonly string[] = [
  "VAT ID not found in the registry",
  "Address does not match registration",
  "Bank account not held by the entity",
  "Contact person unreachable",
];

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
): { value: CompanyVerdict } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { verdict, reason } = body as Record<string, unknown>;

  if (verdict === "VERIFIED") {
    return { value: { verdict: "VERIFIED" } };
  }

  if (verdict !== "FLAGGED") {
    return { error: 'verdict must be either "VERIFIED" or "FLAGGED".' };
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    return { error: "A reason is required to flag the company's details." };
  }

  const trimmedReason = reason.trim();

  if (!COMPANY_FLAG_REASONS.includes(trimmedReason)) {
    return { error: "That is not one of the company flag reasons." };
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

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseCompanyVerdictBody(rawBody);
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
      { error: "Application not found." },
      { status: 404 },
    );
  }

  // `APPROVED` is terminal for this feature, so re-reviewing the company block
  // is a stale tab, not a 404 — say so.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: "This fleet has already been activated." },
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
