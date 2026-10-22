import type { Prisma } from "@prisma/client";

/**
 * The marketing-consent gate for CRM audiences.
 *
 * A `CrmSegment` is the audience of a `CrmCampaign` — a marketing send — so a
 * client who answered Disagree to "I agree to receive personalized marketing
 * offers" (`ClientProfile.marketingConsent = false`) must never be in one.
 *
 * As of this file nothing resolves a segment yet: `CrmSegment.criteria` is
 * stored but the segment-preview / campaign-send logic its schema comment
 * defers to "a later task" does not exist, and the back office's CRM section
 * is only its tab layout. So this is the one clause that logic is to start
 * from — every query that counts, previews or sends to a segment's users
 * `AND`s its own criteria into `marketingAudienceWhere`, never queries `User`
 * directly.
 */

/**
 * Users a marketing send may reach: clients whose profile records consent and
 * who have not deleted their account (`User.deactivatedAt`, see
 * `src/lib/account-deletion`). A client with no `ClientProfile` row is
 * excluded too — there is no recorded answer to rely on.
 */
export const MARKETABLE_CLIENT_WHERE = {
  role: "CLIENT",
  deactivatedAt: null,
  clientProfile: { is: { marketingConsent: true } },
} satisfies Prisma.UserWhereInput;

/**
 * A segment's own filter narrowed to `MARKETABLE_CLIENT_WHERE`. Combined with
 * `AND` rather than spread, so a segment filter that itself mentions `role` or
 * `clientProfile` can only narrow the audience further, never widen it past
 * the consent gate.
 */
export function marketingAudienceWhere(
  segmentWhere: Prisma.UserWhereInput = {},
): Prisma.UserWhereInput {
  return { AND: [MARKETABLE_CLIENT_WHERE, segmentWhere] };
}
