import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { ContactMessageCreateInput } from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { InternalServiceGuard } from "../../common/guards/internal-service.guard";
import { ContactMessagesService } from "./contact-messages.service";

// Trusted via x-internal-secret from apps/web-api, not a Better Auth session.
@Controller("internal/contact-messages")
export class ContactMessagesController {
  // Explicit token: tsx/esbuild doesn't emit design:paramtypes metadata,
  // so Nest can't resolve this by type alone.
  constructor(
    @Inject(ContactMessagesService)
    private readonly service: ContactMessagesService,
  ) {}

  @Post()
  @AllowAnonymous()
  @UseGuards(InternalServiceGuard)
  async create(@Body() body: ContactMessageCreateInput, @CompanyId() companyId: string) {
    return this.service.create(companyId, body);
  }
}
