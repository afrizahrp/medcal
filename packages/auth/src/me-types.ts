import type { MembershipRole } from "@medcal/shared";

/** Minimal capability signal from GET /me — not a general permission API. */
export type MeCapabilities = {
  leadRead: boolean;
  chatRead: boolean;
  emailRead: boolean;
  emailSend: boolean;
  emailDelete: boolean;
  emailManage: boolean;
  customerRead: boolean;
  customerCreate: boolean;
  customerUpdate: boolean;
  uomRead: boolean;
  uomCreate: boolean;
  uomUpdate: boolean;
  deviceCategoryRead: boolean;
  deviceCategoryCreate: boolean;
  deviceCategoryUpdate: boolean;
  deviceCategoryDelete: boolean;
  deviceTypeRead: boolean;
  deviceTypeCreate: boolean;
  deviceTypeUpdate: boolean;
  deviceTypeDelete: boolean;
  deviceTypeAliasRead: boolean;
  deviceTypeAliasCreate: boolean;
  deviceTypeAliasUpdate: boolean;
  deviceTypeAliasDelete: boolean;
  deviceModelRead: boolean;
  deviceModelCreate: boolean;
  deviceModelUpdate: boolean;
  deviceModelDelete: boolean;
  deviceCapabilityRead: boolean;
  deviceCapabilityCreate: boolean;
  deviceCapabilityUpdate: boolean;
  deviceCapabilityDelete: boolean;
  deviceCapabilityItemRead: boolean;
  deviceCapabilityItemCreate: boolean;
  deviceCapabilityItemUpdate: boolean;
  deviceCapabilityItemDelete: boolean;
  deviceCalibrationParameterRead: boolean;
  deviceCalibrationParameterCreate: boolean;
  deviceCalibrationParameterUpdate: boolean;
  deviceCalibrationParameterDelete: boolean;
  devicePhysicalCheckItemRead: boolean;
  devicePhysicalCheckItemCreate: boolean;
  devicePhysicalCheckItemUpdate: boolean;
  devicePhysicalCheckItemDelete: boolean;
  equipmentTypeRead: boolean;
  equipmentTypeCreate: boolean;
  equipmentTypeUpdate: boolean;
  equipmentTypeDelete: boolean;
  equipmentRequirementRead: boolean;
  equipmentRequirementCreate: boolean;
  equipmentRequirementUpdate: boolean;
  equipmentRequirementDelete: boolean;
  equipmentRead: boolean;
  equipmentCreate: boolean;
  equipmentUpdate: boolean;
  equipmentDelete: boolean;
  equipmentCalibrationRecordRead: boolean;
  equipmentCalibrationRecordCreate: boolean;
  equipmentCalibrationRecordUpdate: boolean;
  equipmentCalibrationRecordDelete: boolean;
  deviceRead: boolean;
  deviceCreate: boolean;
  deviceUpdate: boolean;
  deviceDelete: boolean;
  calibrationRequestRead: boolean;
  calibrationRequestCreate: boolean;
  calibrationRequestUpdate: boolean;
  calibrationRequestCancel: boolean;
  quotationRead: boolean;
  quotationCreate: boolean;
  quotationUpdate: boolean;
  quotationCancel: boolean;
  quotationApprove: boolean;
  purchaseOrderRead: boolean;
  purchaseOrderCreate: boolean;
  purchaseOrderUpdate: boolean;
  purchaseOrderCancel: boolean;
  purchaseOrderApprove: boolean;
  workOrderRead: boolean;
  workOrderCreate: boolean;
  workOrderUpdate: boolean;
  workOrderCancel: boolean;
  workOrderAssign: boolean;
  calibrationJobRead: boolean;
  calibrationJobStart: boolean;
  calibrationJobEscalateIdentity: boolean;
  calibrationJobApproveIdentity: boolean;
  /**
   * @deprecated The match-only assign-device action is removed; this flag now
   * always resolves false. Kept so the Portal build compiles until its UI is
   * migrated to the Identity Correction workflow. Use
   * calibrationJobSubmitIdentityCorrection instead.
   */
  calibrationJobAssignDevice: boolean;
  calibrationJobSubmitIdentityCorrection: boolean;
  calibrationJobDecideIdentityCorrection: boolean;
  calibrationJobRecordReferenceEquipmentUsed: boolean;
  calibrationJobOverrideReferenceEquipmentValidity: boolean;
  calibrationJobSubmitReferenceEquipmentApproval: boolean;
  calibrationJobDecideReferenceEquipmentApproval: boolean;
  calibrationJobRecordMeasurement: boolean;
  calibrationJobRecordPhysicalCheck: boolean;
  calibrationJobRecordKontrolAlat: boolean;
  calibrationJobSubmitForReview: boolean;
  calibrationJobDecideQualityReview: boolean;
  calibrationJobResumeAfterRework: boolean;
  calibrationJobComplete: boolean;
  taxManage: boolean;
  priceListItemRead: boolean;
  priceListItemCreate: boolean;
  priceListItemUpdate: boolean;
  priceListItemDelete: boolean;
};

export type MeUser = {
  id: string;
  email: string;
  name: string;
};

export type MeMembership = {
  role: MembershipRole;
  companyId: string;
};

export type Me = {
  user: MeUser;
  membership: MeMembership;
  capabilities: MeCapabilities;
};

export type AuthBootstrapStatus = "loading" | "ready" | "forbidden" | "pending";
