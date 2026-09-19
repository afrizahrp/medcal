-- CreateTable
CREATE TABLE "CalibrationRequestHistory" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "leadId" TEXT,
    "serviceMode" "ServiceMode" NOT NULL,
    "expectedDate" DATE,
    "status" "CalibrationRequestStatus" NOT NULL,
    "notes" TEXT,
    "revisedByUserId" TEXT,
    "revisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationRequestHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationRequestItemHistory" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "customerDeviceName" TEXT,
    "model" TEXT,
    "deviceId" TEXT,
    "qty" INTEGER NOT NULL,
    "akdAkl" TEXT,
    "akdAklDeclaration" "AkdAklDeclaration" NOT NULL,

    CONSTRAINT "CalibrationRequestItemHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationHistory" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "source" "QuotationSource" NOT NULL,
    "status" "QuotationStatus" NOT NULL,
    "validUntil" TIMESTAMP(3),
    "subtotal" DECIMAL(18,2) NOT NULL,
    "headerDiscountAmount" DECIMAL(18,2) NOT NULL,
    "taxCode" TEXT NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "customerApprovedAt" TIMESTAMP(3),
    "revisedByUserId" TEXT,
    "revisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItemHistory" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "deviceId" TEXT,
    "requestItemId" TEXT,
    "tariffId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "pricePending" BOOLEAN NOT NULL,

    CONSTRAINT "QuotationItemHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderHistory" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerPoNumber" TEXT NOT NULL,
    "customerPoDate" TIMESTAMP(3) NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "headerDiscountAmount" DECIMAL(18,2) NOT NULL,
    "taxCode" TEXT NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "notes" TEXT,
    "revisedByUserId" TEXT,
    "revisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItemHistory" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "quotationItemId" TEXT NOT NULL,
    "deviceId" TEXT,
    "tariffId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "status" "PurchaseOrderItemStatus" NOT NULL,

    CONSTRAINT "PurchaseOrderItemHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderHistory" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "serviceMode" "ServiceMode" NOT NULL,
    "addressText" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "locationNotes" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "status" "WorkOrderStatus" NOT NULL,
    "equipmentConfirmedAt" TIMESTAMP(3),
    "revisedByUserId" TEXT,
    "revisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderItemHistory" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "WorkOrderItemHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalibrationRequestHistory_requestId_idx" ON "CalibrationRequestHistory"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationRequestHistory_requestId_revisionNumber_key" ON "CalibrationRequestHistory"("requestId", "revisionNumber");

-- CreateIndex
CREATE INDEX "CalibrationRequestItemHistory_historyId_idx" ON "CalibrationRequestItemHistory"("historyId");

-- CreateIndex
CREATE INDEX "QuotationHistory_quotationId_idx" ON "QuotationHistory"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationHistory_quotationId_revisionNumber_key" ON "QuotationHistory"("quotationId", "revisionNumber");

-- CreateIndex
CREATE INDEX "QuotationItemHistory_historyId_idx" ON "QuotationItemHistory"("historyId");

-- CreateIndex
CREATE INDEX "PurchaseOrderHistory_purchaseOrderId_idx" ON "PurchaseOrderHistory"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderHistory_purchaseOrderId_revisionNumber_key" ON "PurchaseOrderHistory"("purchaseOrderId", "revisionNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderItemHistory_historyId_idx" ON "PurchaseOrderItemHistory"("historyId");

-- CreateIndex
CREATE INDEX "WorkOrderHistory_workOrderId_idx" ON "WorkOrderHistory"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderHistory_workOrderId_revisionNumber_key" ON "WorkOrderHistory"("workOrderId", "revisionNumber");

-- CreateIndex
CREATE INDEX "WorkOrderItemHistory_historyId_idx" ON "WorkOrderItemHistory"("historyId");

-- AddForeignKey
ALTER TABLE "CalibrationRequestHistory" ADD CONSTRAINT "CalibrationRequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CalibrationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRequestHistory" ADD CONSTRAINT "CalibrationRequestHistory_revisedByUserId_fkey" FOREIGN KEY ("revisedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRequestItemHistory" ADD CONSTRAINT "CalibrationRequestItemHistory_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "CalibrationRequestHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationHistory" ADD CONSTRAINT "QuotationHistory_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationHistory" ADD CONSTRAINT "QuotationHistory_revisedByUserId_fkey" FOREIGN KEY ("revisedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItemHistory" ADD CONSTRAINT "QuotationItemHistory_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "QuotationHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderHistory" ADD CONSTRAINT "PurchaseOrderHistory_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderHistory" ADD CONSTRAINT "PurchaseOrderHistory_revisedByUserId_fkey" FOREIGN KEY ("revisedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItemHistory" ADD CONSTRAINT "PurchaseOrderItemHistory_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "PurchaseOrderHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderHistory" ADD CONSTRAINT "WorkOrderHistory_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderHistory" ADD CONSTRAINT "WorkOrderHistory_revisedByUserId_fkey" FOREIGN KEY ("revisedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItemHistory" ADD CONSTRAINT "WorkOrderItemHistory_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "WorkOrderHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
