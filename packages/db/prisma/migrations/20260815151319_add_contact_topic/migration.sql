-- CreateTable
CREATE TABLE "ContactTopic" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactTopic_isActive_idx" ON "ContactTopic"("isActive");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ContactTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
