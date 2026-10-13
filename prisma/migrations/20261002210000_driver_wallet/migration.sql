-- Driver wallet: bank accounts, withdrawals, an append-only ledger, and the
-- explicit "funds confirmed received by a gateway" fact on a payment.
--
-- Purely additive: three nullable columns on "Payment" that nothing has ever
-- written (so every existing payment is, correctly, unconfirmed), five enums
-- and four tables the previous deployment never touches.
--
-- The two CHECK constraints are not expressible in the Prisma schema; they are
-- the database's own statement of what the code already guarantees.
CREATE TYPE "GeorgianBank" AS ENUM ('TBC', 'BANK_OF_GEORGIA', 'LIBERTY', 'PROCREDIT', 'BASISBANK');

CREATE TYPE "BankAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'REVERSED');

CREATE TYPE "WalletEntryType" AS ENUM ('JOB_PAYOUT', 'JOB_OVERTIME', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADJUSTMENT');

CREATE TYPE "WalletCreditHoldReason" AS ENUM ('ROSTER_SELF_CLAIM');

ALTER TABLE "Payment" ADD COLUMN     "gatewayConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "gatewayName" TEXT,
ADD COLUMN     "gatewayReference" TEXT;

CREATE TABLE "DriverBankAccount" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "bank" "GeorgianBank" NOT NULL,
    "iban" TEXT NOT NULL,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amountTetri" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "bank" "GeorgianBank" NOT NULL,
    "iban" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "bankReference" TEXT,
    "rejectionReason" TEXT,
    "reversalReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "requestKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "amountTetri" INTEGER NOT NULL,
    "orderId" TEXT,
    "withdrawalId" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletCreditHold" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "companyId" TEXT,
    "reason" "WalletCreditHoldReason" NOT NULL,
    "amountTetri" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletCreditHold_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DriverBankAccount_driverProfileId_idx" ON "DriverBankAccount"("driverProfileId");

CREATE INDEX "DriverBankAccount_status_createdAt_idx" ON "DriverBankAccount"("status", "createdAt");

CREATE INDEX "DriverBankAccount_iban_idx" ON "DriverBankAccount"("iban");

CREATE INDEX "Withdrawal_driverProfileId_createdAt_idx" ON "Withdrawal"("driverProfileId", "createdAt");

CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

CREATE INDEX "Withdrawal_bankAccountId_idx" ON "Withdrawal"("bankAccountId");

CREATE UNIQUE INDEX "Withdrawal_driverProfileId_requestKey_key" ON "Withdrawal"("driverProfileId", "requestKey");

CREATE INDEX "WalletLedgerEntry_driverProfileId_createdAt_idx" ON "WalletLedgerEntry"("driverProfileId", "createdAt");

CREATE UNIQUE INDEX "WalletLedgerEntry_orderId_type_key" ON "WalletLedgerEntry"("orderId", "type");

CREATE UNIQUE INDEX "WalletLedgerEntry_withdrawalId_type_key" ON "WalletLedgerEntry"("withdrawalId", "type");

CREATE UNIQUE INDEX "WalletCreditHold_orderId_key" ON "WalletCreditHold"("orderId");

CREATE INDEX "WalletCreditHold_driverProfileId_idx" ON "WalletCreditHold"("driverProfileId");

CREATE INDEX "WalletCreditHold_createdAt_idx" ON "WalletCreditHold"("createdAt");

CREATE UNIQUE INDEX "Payment_gatewayName_gatewayReference_key" ON "Payment"("gatewayName", "gatewayReference");

ALTER TABLE "DriverBankAccount" ADD CONSTRAINT "DriverBankAccount_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "DriverBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletCreditHold" ADD CONSTRAINT "WalletCreditHold_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WalletCreditHold" ADD CONSTRAINT "WalletCreditHold_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_amountTetri_positive" CHECK ("amountTetri" > 0);

ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_amountTetri_nonzero" CHECK ("amountTetri" <> 0);
