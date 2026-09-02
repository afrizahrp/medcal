-- CreateEnum
CREATE TYPE "AkdAklDeclaration" AS ENUM ('NOT_PROVIDED', 'CUSTOMER_DECLARED_NONE', 'CUSTOMER_PROVIDED');

-- AlterTable
ALTER TABLE "CalibrationRequestItem" ADD COLUMN     "akdAkl" TEXT,
ADD COLUMN     "akdAklDeclaration" "AkdAklDeclaration" NOT NULL DEFAULT 'NOT_PROVIDED';
