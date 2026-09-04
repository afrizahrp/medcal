-- CreateEnum
CREATE TYPE "IdentityCorrectionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IdentityCorrectionSignerRole" AS ENUM ('TECHNICIAN', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('SIGNED', 'UNAVAILABLE', 'REFUSED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'IDENTITY_CORRECTION_BA';

-- AlterEnum
ALTER TYPE "FileOwnerType" ADD VALUE 'IDENTITY_CORRECTION';

-- CreateTable
CREATE TABLE "IdentityCorrection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "calibrationJobId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "IdentityCorrectionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "prevDeviceId" TEXT,
    "newDeviceId" TEXT,
    "prevSerial" TEXT,
    "newSerial" TEXT,
    "prevAkdAkl" TEXT,
    "newAkdAkl" TEXT,
    "reason" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "akdAklGateReopened" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityCorrectionSignature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "identityCorrectionId" TEXT NOT NULL,
    "signerRole" "IdentityCorrectionSignerRole" NOT NULL,
    "signerName" TEXT,
    "fileObjectId" TEXT,
    "status" "SignatureStatus" NOT NULL DEFAULT 'SIGNED',
    "unavailableReason" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityCorrectionSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityCorrection_companyId_status_idx" ON "IdentityCorrection"("companyId", "status");

-- CreateIndex
CREATE INDEX "IdentityCorrection_calibrationJobId_idx" ON "IdentityCorrection"("calibrationJobId");

-- CreateIndex
CREATE INDEX "IdentityCorrection_submittedByUserId_idx" ON "IdentityCorrection"("submittedByUserId");

-- CreateIndex
CREATE INDEX "IdentityCorrection_decidedByUserId_idx" ON "IdentityCorrection"("decidedByUserId");

-- CreateIndex
CREATE INDEX "IdentityCorrection_prevDeviceId_idx" ON "IdentityCorrection"("prevDeviceId");

-- CreateIndex
CREATE INDEX "IdentityCorrection_newDeviceId_idx" ON "IdentityCorrection"("newDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityCorrection_companyId_number_key" ON "IdentityCorrection"("companyId", "number");

-- CreateIndex
CREATE INDEX "IdentityCorrectionSignature_companyId_idx" ON "IdentityCorrectionSignature"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityCorrectionSignature_identityCorrectionId_signerRole_key" ON "IdentityCorrectionSignature"("identityCorrectionId", "signerRole");

-- AddForeignKey
ALTER TABLE "IdentityCorrection" ADD CONSTRAINT "IdentityCorrection_calibrationJobId_fkey" FOREIGN KEY ("calibrationJobId") REFERENCES "CalibrationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityCorrection" ADD CONSTRAINT "IdentityCorrection_prevDeviceId_fkey" FOREIGN KEY ("prevDeviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityCorrection" ADD CONSTRAINT "IdentityCorrection_newDeviceId_fkey" FOREIGN KEY ("newDeviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityCorrection" ADD CONSTRAINT "IdentityCorrection_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityCorrection" ADD CONSTRAINT "IdentityCorrection_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityCorrectionSignature" ADD CONSTRAINT "IdentityCorrectionSignature_identityCorrectionId_fkey" FOREIGN KEY ("identityCorrectionId") REFERENCES "IdentityCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
