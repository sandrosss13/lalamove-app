-- Proof of delivery: one to three photos (`PodPhoto`) and one recipient
-- signature (`Order.podSignaturePath`), registered by the assigned driver while
-- the order is IN_TRANSIT and required by `POST /api/orders/[id]/complete` for
-- a completion made from the driver app.
--
-- Purely additive, so it is safe against a populated table and against the
-- previous deployment serving traffic for the length of a build
-- (`scripts/migrate-deploy.mjs` runs this ahead of `next build`):
--
--   * `podSignaturePath` is a nullable column with no default — a
--     catalogue-only change in Postgres 11+, no row rewritten, no long lock.
--     Every order completed before this existed genuinely has no signature.
--   * `PodPhoto` is a new table nothing in the old code reads or writes.
--
-- Both hold object paths in the private `delivery-proofs` Storage bucket, never
-- URLs. That bucket is a manual provisioning step — see `env.example`.
ALTER TABLE "Order" ADD COLUMN "podSignaturePath" TEXT;

CREATE TABLE "PodPhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PodPhoto_storagePath_key" ON "PodPhoto"("storagePath");

CREATE INDEX "PodPhoto_orderId_idx" ON "PodPhoto"("orderId");

ALTER TABLE "PodPhoto" ADD CONSTRAINT "PodPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
