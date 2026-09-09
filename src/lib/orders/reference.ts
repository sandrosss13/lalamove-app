/**
 * The human-readable order reference (`GE-48210` form) shown to drivers on the
 * load board and read aloud to support over the phone.
 *
 * `Order.id` is a cuid. Nobody can dictate a cuid down a phone line, and nobody
 * should have to — `Order.reference` exists to be the identifier a human
 * actually uses, on the board's table, in the drawer header and in a support
 * conversation.
 *
 * This module only *formats* a reference from an already-resolved sequence
 * number; it does not allocate one. Prisma has no native support for reading a
 * Postgres sequence, so the `nextval` call is made with `prisma.$queryRaw` at
 * order creation, which is the only place `Order.reference` is ever written.
 * Keeping the formatting pure — no Prisma import, no `server-only`, no side
 * effects — means the same function can run in a client component to render or
 * preview a reference's shape without pulling database code into the browser
 * bundle.
 */

/**
 * Name of the Postgres sequence that supplies the numeric part of every order
 * reference, created by this feature's migration as:
 *
 * ```sql
 * CREATE SEQUENCE "order_reference_seq" START WITH 48200 INCREMENT BY 1;
 * ```
 *
 * A sequence rather than a count or a random number: it is atomic under
 * concurrent inserts, so two orders created at the same instant cannot collide
 * on the `@unique` column, and it never reuses a value after a rolled-back
 * transaction.
 *
 * It starts at 48200 rather than 1 so the first reference issued reads as an
 * established operation rather than advertising exact order volume to every
 * client and driver who sees one.
 *
 * Exported as a named constant because the sequence name has to be written
 * literally into a raw SQL string at the `nextval` call site, and a bare string
 * there would be one typo away from a runtime error no type checker could catch.
 */
export const ORDER_REFERENCE_SEQUENCE = "order_reference_seq";

/**
 * Format a resolved sequence value as the reference drivers and support see.
 *
 * The `GE-` prefix is provisional. `src/lib/admin/home-page-content.ts` still
 * carries unresolved `TODO(content)` markers around the brand name, and
 * `specs/driver-load-board/action-required.md` lists confirming the reference
 * format as an open item for exactly that reason. Changing the prefix later is a
 * one-line edit here and not a migration, because the sequence stores only the
 * number — the prefix exists nowhere in the database.
 */
export function formatOrderReference(sequenceValue: number): string {
  return `GE-${sequenceValue}`;
}
