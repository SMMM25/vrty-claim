-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "fundedBy" TEXT,
    "amount" TEXT NOT NULL DEFAULT '58.9',
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "failReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimCounter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletFunding" (
    "walletAddress" TEXT NOT NULL,
    "fundedBy" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletFunding_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateIndex
CREATE UNIQUE INDEX "Claim_walletAddress_key" ON "Claim"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_txHash_key" ON "Claim"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_idempotencyKey_key" ON "Claim"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Claim_ipAddress_idx" ON "Claim"("ipAddress");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE INDEX "Claim_fundedBy_idx" ON "Claim"("fundedBy");

-- CreateIndex
CREATE INDEX "Claim_createdAt_idx" ON "Claim"("createdAt");

-- CreateIndex
CREATE INDEX "WalletFunding_fundedBy_idx" ON "WalletFunding"("fundedBy");
