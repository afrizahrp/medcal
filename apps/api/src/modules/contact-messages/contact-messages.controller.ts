import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import type { ContactMessageCreateInput } from "@medcal/shared";
import { ContactMessagesService } from "./contact-messages.service";

@Controller("internal/contact-messages")
export class ContactMessagesController {
  constructor(private readonly service: ContactMessagesService) {}

  @Post()
  async create(
    @Body() body: ContactMessageCreateInput,
    @Headers("x-internal-secret") secret: string | undefined,
    @Headers("x-company-id") companyId: string | undefined,
  ) {
    const expected = process.env.INTERNAL_API_SECRET ?? "";
    if (!expected || secret !== expected) {
      throw new UnauthorizedException("Invalid internal secret");
    }
    if (!companyId) {
      throw new UnauthorizedException("Missing company id");
    }
    return this.service.create(companyId, body);
  }
}
