import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import type { ContactMessage } from "@medcal/db";
import { contactMessageLeadResolutionSchema, contactMessageStatusUpdateSchema } from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { ContactMessagesService } from "./contact-messages.service";

// Session-based route, distinct from the internal-secret-trusted
// internal/contact-messages controller — separate path/prefix on purpose.
@Controller("contact-messages")
@UseGuards(CompanyRoleGuard)
export class ContactMessagesQueryController {
  constructor(
    @Inject(ContactMessagesService)
    private readonly service: ContactMessagesService,
  ) {}

  @Get()
  @RequirePermission("contactMessage", "read")
  async list(@CompanyId() companyId: string): Promise<ContactMessage[]> {
    return this.service.findAll(companyId);
  }

  // Declared before ":id"-shaped routes are ever added so "unread-count" is
  // never captured as a ContactMessage id (same precedent as
  // leads.controller.ts's "needs-review"). Canonical unread count for the
  // Management header's Contact Messages badge — see
  // ContactMessagesService.countUnread for the PENDING-status definition.
  @Get("unread-count")
  @RequirePermission("contactMessage", "read")
  async unreadCount(@CompanyId() companyId: string): Promise<{ count: number }> {
    const count = await this.service.countUnread(companyId);
    return { count };
  }

  // Unread tracking reuses ContactStatus.PENDING→READ (Lead Inbox design
  // review §5/§10, Decision 4) — no separate unread field.
  @Patch(":id/status")
  @RequirePermission("contactMessage", "read")
  async updateStatus(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<ContactMessage> {
    const parsed = contactMessageStatusUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid contact message status",
        code: "INVALID_CONTACT_MESSAGE_STATUS",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.updateStatus(companyId, id, parsed.data.status);
  }

  // Needs Review staff resolution (Lead Inbox corrective patch, locked
  // 2026-08-16) — attach to an existing Lead or create a new one. Uses
  // lead:update since this mutates Lead attachment/creation, same permission
  // PATCH /leads/:id/status already requires.
  @Patch(":id/lead")
  @RequirePermission("lead", "update")
  async resolveLead(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<ContactMessage> {
    const parsed = contactMessageLeadResolutionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid lead resolution",
        code: "INVALID_LEAD_RESOLUTION",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.resolveLeadMatch(companyId, id, parsed.data);
  }
}
