-- Update-audit standardization: updatedByUserId (nullable FK -> User) on every
-- mutable business model; updatedAt added to 4 mutable item tables that lacked it.
-- Existing rows: updatedAt backfilled to createdAt; updatedByUserId stays NULL
-- (actor unknown for historical rows; never inferred from createdBy).

-- Company
ALTER TABLE "Company" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Company" ADD CONSTRAINT "Company_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User
ALTER TABLE "User" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UserMembership
ALTER TABLE "UserMembership" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "UserMembership" ADD CONSTRAINT "UserMembership_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uom
ALTER TABLE "Uom" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Uom" ADD CONSTRAINT "Uom_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lead
ALTER TABLE "Lead" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ContactMessage
ALTER TABLE "ContactMessage" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ContactTopic
ALTER TABLE "ContactTopic" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "ContactTopic" ADD CONSTRAINT "ContactTopic_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Email
ALTER TABLE "Email" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Email" ADD CONSTRAINT "Email_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Customer
ALTER TABLE "Customer" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CustomerContact
ALTER TABLE "CustomerContact" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceCategory
ALTER TABLE "DeviceCategory" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceCategory" ADD CONSTRAINT "DeviceCategory_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceType
ALTER TABLE "DeviceType" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceType" ADD CONSTRAINT "DeviceType_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceTypeAlias
ALTER TABLE "DeviceTypeAlias" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceTypeAlias" ADD CONSTRAINT "DeviceTypeAlias_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EquipmentType
ALTER TABLE "EquipmentType" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "EquipmentType" ADD CONSTRAINT "EquipmentType_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Equipment
ALTER TABLE "Equipment" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EquipmentCalibrationRecord
ALTER TABLE "EquipmentCalibrationRecord" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "EquipmentCalibrationRecord" ADD CONSTRAINT "EquipmentCalibrationRecord_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceTypeEquipmentRequirement
ALTER TABLE "DeviceTypeEquipmentRequirement" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceTypeEquipmentRequirement" ADD CONSTRAINT "DeviceTypeEquipmentRequirement_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceManufacturer
ALTER TABLE "DeviceManufacturer" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceManufacturer" ADD CONSTRAINT "DeviceManufacturer_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceModel
ALTER TABLE "DeviceModel" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceModel" ADD CONSTRAINT "DeviceModel_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceCapability
ALTER TABLE "DeviceCapability" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceCapability" ADD CONSTRAINT "DeviceCapability_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceCapabilityItem
ALTER TABLE "DeviceCapabilityItem" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceCapabilityItem" ADD CONSTRAINT "DeviceCapabilityItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceCalibrationParameter
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceCalibrationParameter" ADD CONSTRAINT "DeviceCalibrationParameter_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DeviceTypeCapabilityOrder
ALTER TABLE "DeviceTypeCapabilityOrder" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DeviceTypeCapabilityOrder" ADD CONSTRAINT "DeviceTypeCapabilityOrder_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DevicePhysicalCheckItem
ALTER TABLE "DevicePhysicalCheckItem" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "DevicePhysicalCheckItem" ADD CONSTRAINT "DevicePhysicalCheckItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Device
ALTER TABLE "Device" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Device" ADD CONSTRAINT "Device_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CalibrationRequestItem
ALTER TABLE "CalibrationRequestItem" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "CalibrationRequestItem" SET "updatedAt" = "createdAt";
ALTER TABLE "CalibrationRequestItem" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "CalibrationRequestItem" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "CalibrationRequestItem" ADD CONSTRAINT "CalibrationRequestItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ServiceTariff
ALTER TABLE "ServiceTariff" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "ServiceTariff" ADD CONSTRAINT "ServiceTariff_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PriceListItem
ALTER TABLE "PriceListItem" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Quotation
ALTER TABLE "Quotation" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- QuotationItem
ALTER TABLE "QuotationItem" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "QuotationItem" SET "updatedAt" = "createdAt";
ALTER TABLE "QuotationItem" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "QuotationItem" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PurchaseOrderItem
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "PurchaseOrderItem" SET "updatedAt" = "createdAt";
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkOrder
ALTER TABLE "WorkOrder" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PurchaseOrderItemAllocation
ALTER TABLE "PurchaseOrderItemAllocation" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "PurchaseOrderItemAllocation" ADD CONSTRAINT "PurchaseOrderItemAllocation_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkOrderEquipment
ALTER TABLE "WorkOrderEquipment" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "WorkOrderEquipment" ADD CONSTRAINT "WorkOrderEquipment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EquipmentDeliveryNote
ALTER TABLE "EquipmentDeliveryNote" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "EquipmentDeliveryNote" ADD CONSTRAINT "EquipmentDeliveryNote_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CalibrationJob
ALTER TABLE "CalibrationJob" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- KontrolAlat
ALTER TABLE "KontrolAlat" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "KontrolAlat" ADD CONSTRAINT "KontrolAlat_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- KontrolAlatAccessory
ALTER TABLE "KontrolAlatAccessory" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "KontrolAlatAccessory" ADD CONSTRAINT "KontrolAlatAccessory_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- KontrolAlatSignature
ALTER TABLE "KontrolAlatSignature" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "KontrolAlatSignature" ADD CONSTRAINT "KontrolAlatSignature_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CalibrationTestPoint
ALTER TABLE "CalibrationTestPoint" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "CalibrationTestPoint" ADD CONSTRAINT "CalibrationTestPoint_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JobCalibrationTestPoint
ALTER TABLE "JobCalibrationTestPoint" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "JobCalibrationTestPoint" ADD CONSTRAINT "JobCalibrationTestPoint_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MeasurementResult
ALTER TABLE "MeasurementResult" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "MeasurementResult" ADD CONSTRAINT "MeasurementResult_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PhysicalCheckResult
ALTER TABLE "PhysicalCheckResult" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "PhysicalCheckResult" ADD CONSTRAINT "PhysicalCheckResult_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JobReferenceEquipmentUsed
ALTER TABLE "JobReferenceEquipmentUsed" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "JobReferenceEquipmentUsed" ADD CONSTRAINT "JobReferenceEquipmentUsed_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JobReferenceEquipmentApproval
ALTER TABLE "JobReferenceEquipmentApproval" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "JobReferenceEquipmentApproval" ADD CONSTRAINT "JobReferenceEquipmentApproval_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JobReferenceEquipmentApprovalItem
ALTER TABLE "JobReferenceEquipmentApprovalItem" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "JobReferenceEquipmentApprovalItem" SET "updatedAt" = "createdAt";
ALTER TABLE "JobReferenceEquipmentApprovalItem" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "JobReferenceEquipmentApprovalItem" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "JobReferenceEquipmentApprovalItem" ADD CONSTRAINT "JobReferenceEquipmentApprovalItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- IdentityCorrection
ALTER TABLE "IdentityCorrection" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "IdentityCorrection" ADD CONSTRAINT "IdentityCorrection_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- IdentityCorrectionSignature
ALTER TABLE "IdentityCorrectionSignature" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "IdentityCorrectionSignature" ADD CONSTRAINT "IdentityCorrectionSignature_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- QualityReview
ALTER TABLE "QualityReview" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "QualityReview" ADD CONSTRAINT "QualityReview_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tax
ALTER TABLE "Tax" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "Tax" ADD CONSTRAINT "Tax_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreditNote
ALTER TABLE "CreditNote" ADD COLUMN "updatedByUserId" TEXT;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
