import { Controller, Get, Inject } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { ContactTopic } from "@medcal/db";
import { ContactMessagesService } from "./contact-messages.service";

// Public, read-only reference data (global, no companyId) — the Contact
// Form's topic select needs this before the visitor has any session.
@Controller("contact-topics")
export class ContactTopicsController {
  constructor(
    @Inject(ContactMessagesService)
    private readonly service: ContactMessagesService,
  ) {}

  @Get()
  @AllowAnonymous()
  async list(): Promise<ContactTopic[]> {
    return this.service.findActiveTopics();
  }
}
