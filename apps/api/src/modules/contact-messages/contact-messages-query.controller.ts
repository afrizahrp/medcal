import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ContactMessage } from "@medcal/db";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { ContactMessagesService } from "./contact-messages.service";

// Session-based route, distinct from the internal-secret-trusted
// internal/contact-messages controller — separate path/prefix on purpose.
@Controller("contact-messages")
export class ContactMessagesQueryController {
  constructor(
    @Inject(ContactMessagesService)
    private readonly service: ContactMessagesService,
  ) {}

  @Get()
  @RequirePermission("contactMessage", "read")
  @UseGuards(CompanyRoleGuard)
  async list(@CompanyId() companyId: string): Promise<ContactMessage[]> {
    return this.service.findAll(companyId);
  }
}
