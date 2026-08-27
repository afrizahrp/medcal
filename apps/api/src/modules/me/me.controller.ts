import { Controller, ForbiddenException, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, hasPermission } from "@medcal/auth";
import { prisma } from "@medcal/db";

const FORBIDDEN_MESSAGE = "Forbidden";

// "Who am I" — no permission to check, just the caller's own session +
// membership. Protected by the default global AuthGuard only (401 if no
// session); reuses the same lookup CompanyRoleGuard already performs.
@Controller("me")
export class MeController {
  @Get()
  async getMe(@Req() request: Request) {
    const companyId = process.env.COMPANY_ID;
    if (!companyId) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
      include: { user: { select: { status: true } } },
    });
    // No membership yet, or membership not yet ACTIVE: this is the G1/G5
    // "registered but not provisioned" lifecycle state, not a permission
    // denial. `code` lets the frontend show a Pending Authorization UX
    // instead of the generic Access Denied one, without changing the 403
    // enforcement itself. DISABLED keeps its own code so it is never
    // reinterpreted as pending (G3).
    if (!membership) {
      throw new ForbiddenException({ message: FORBIDDEN_MESSAGE, code: "ACCOUNT_PENDING" });
    }
    if (membership.user.status === "DISABLED") {
      throw new ForbiddenException({ message: FORBIDDEN_MESSAGE, code: "ACCOUNT_DISABLED" });
    }
    // G5: access requires ACTIVE + membership. INVITED is not authorized.
    if (membership.user.status !== "ACTIVE") {
      throw new ForbiddenException({ message: FORBIDDEN_MESSAGE, code: "ACCOUNT_PENDING" });
    }

    // Minimal, narrowly-scoped client-safe capability signal — NOT a general
    // permission-check API. Only the two booleans concrete non-menu UI
    // surfaces (Dashboard shortcuts, header notification icons) actually need
    // today, computed via the existing hasPermission catalog. Do not widen
    // this into an arbitrary "check any resource:action" endpoint or a full
    // permissions array — menu visibility already goes through /menu/nav;
    // this exists only for surfaces that aren't Menu Registry items.
    const capabilities = {
      leadRead: hasPermission(membership.role, "lead", "read"),
      chatRead: hasPermission(membership.role, "chat", "read"),
      emailRead: hasPermission(membership.role, "email", "read"),
      emailSend: hasPermission(membership.role, "email", "send"),
      emailDelete: hasPermission(membership.role, "email", "delete"),
      emailManage: hasPermission(membership.role, "email", "manage"),
      customerRead: hasPermission(membership.role, "customer", "read"),
      customerCreate: hasPermission(membership.role, "customer", "create"),
      customerUpdate: hasPermission(membership.role, "customer", "update"),
      uomRead: hasPermission(membership.role, "uom", "read"),
      uomCreate: hasPermission(membership.role, "uom", "create"),
      uomUpdate: hasPermission(membership.role, "uom", "update"),
      deviceCategoryRead: hasPermission(membership.role, "deviceCategory", "read"),
      deviceCategoryCreate: hasPermission(membership.role, "deviceCategory", "create"),
      deviceCategoryUpdate: hasPermission(membership.role, "deviceCategory", "update"),
      deviceCategoryDelete: hasPermission(membership.role, "deviceCategory", "delete"),
      deviceTypeRead: hasPermission(membership.role, "deviceType", "read"),
      deviceTypeCreate: hasPermission(membership.role, "deviceType", "create"),
      deviceTypeUpdate: hasPermission(membership.role, "deviceType", "update"),
      deviceTypeDelete: hasPermission(membership.role, "deviceType", "delete"),
      deviceModelRead: hasPermission(membership.role, "deviceModel", "read"),
      deviceModelCreate: hasPermission(membership.role, "deviceModel", "create"),
      deviceModelUpdate: hasPermission(membership.role, "deviceModel", "update"),
      deviceModelDelete: hasPermission(membership.role, "deviceModel", "delete"),
      deviceCapabilityRead: hasPermission(membership.role, "deviceCapability", "read"),
      deviceCapabilityCreate: hasPermission(membership.role, "deviceCapability", "create"),
      deviceCapabilityUpdate: hasPermission(membership.role, "deviceCapability", "update"),
      deviceCapabilityDelete: hasPermission(membership.role, "deviceCapability", "delete"),
      deviceCapabilityItemRead: hasPermission(membership.role, "deviceCapabilityItem", "read"),
      deviceCapabilityItemCreate: hasPermission(membership.role, "deviceCapabilityItem", "create"),
      deviceCapabilityItemUpdate: hasPermission(membership.role, "deviceCapabilityItem", "update"),
      deviceCapabilityItemDelete: hasPermission(membership.role, "deviceCapabilityItem", "delete"),
      deviceCalibrationParameterRead: hasPermission(membership.role, "deviceCalibrationParameter", "read"),
      deviceCalibrationParameterCreate: hasPermission(
        membership.role,
        "deviceCalibrationParameter",
        "create",
      ),
      deviceCalibrationParameterUpdate: hasPermission(
        membership.role,
        "deviceCalibrationParameter",
        "update",
      ),
      deviceCalibrationParameterDelete: hasPermission(
        membership.role,
        "deviceCalibrationParameter",
        "delete",
      ),
      deviceRead: hasPermission(membership.role, "device", "read"),
      deviceCreate: hasPermission(membership.role, "device", "create"),
      deviceUpdate: hasPermission(membership.role, "device", "update"),
      deviceDelete: hasPermission(membership.role, "device", "delete"),
      calibrationRequestRead: hasPermission(membership.role, "calibrationRequest", "read"),
      calibrationRequestCreate: hasPermission(membership.role, "calibrationRequest", "create"),
      calibrationRequestUpdate: hasPermission(membership.role, "calibrationRequest", "update"),
      calibrationRequestCancel: hasPermission(membership.role, "calibrationRequest", "cancel"),
      quotationRead: hasPermission(membership.role, "quotation", "read"),
      quotationCreate: hasPermission(membership.role, "quotation", "create"),
      quotationUpdate: hasPermission(membership.role, "quotation", "update"),
      quotationCancel: hasPermission(membership.role, "quotation", "cancel"),
      quotationApprove: hasPermission(membership.role, "quotation", "approve"),
    };

    return {
      user: session.user,
      membership: { role: membership.role, companyId: membership.companyId },
      capabilities,
    };
  }
}
