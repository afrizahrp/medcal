-- CreateEnum
CREATE TYPE "EmailFolder" AS ENUM ('INBOX', 'SENT', 'DRAFTS', 'TRASH');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('UNREAD', 'READ');

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messageId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "ccEmail" TEXT,
    "bccEmail" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "textBody" TEXT,
    "folder" "EmailFolder" NOT NULL DEFAULT 'INBOX',
    "status" "EmailStatus" NOT NULL DEFAULT 'UNREAD',
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "parentEmailId" TEXT,
    "rfcInReplyTo" TEXT,
    "rfcReferences" TEXT,
    "suggestedLeadId" TEXT,
    "leadId" TEXT,
    "contactMessageId" TEXT,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Email_messageId_key" ON "Email"("messageId");

-- CreateIndex
CREATE INDEX "Email_companyId_folder_idx" ON "Email"("companyId", "folder");

-- CreateIndex
CREATE INDEX "Email_companyId_status_idx" ON "Email"("companyId", "status");

-- CreateIndex
CREATE INDEX "Email_companyId_leadId_idx" ON "Email"("companyId", "leadId");

-- CreateIndex
CREATE INDEX "Email_companyId_suggestedLeadId_idx" ON "Email"("companyId", "suggestedLeadId");

-- CreateIndex
CREATE INDEX "Email_companyId_createdAt_idx" ON "Email"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Email_messageId_idx" ON "Email"("messageId");

-- CreateIndex
CREATE INDEX "Email_contactMessageId_idx" ON "Email"("contactMessageId");

-- CreateIndex
CREATE INDEX "Email_parentEmailId_idx" ON "Email"("parentEmailId");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_suggestedLeadId_fkey" FOREIGN KEY ("suggestedLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_contactMessageId_fkey" FOREIGN KEY ("contactMessageId") REFERENCES "ContactMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_parentEmailId_fkey" FOREIGN KEY ("parentEmailId") REFERENCES "Email"("id") ON DELETE SET NULL ON UPDATE CASCADE;
