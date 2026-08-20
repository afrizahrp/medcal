import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { MembershipRole } from "@medcal/db";
import {
  emailComposeSchema,
  emailDraftSchema,
  emailListQuerySchema,
  emailUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { MembershipRoleParam } from "../../common/decorators/membership-role.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { EmailsService } from "./emails.service";

@Controller("emails")
@UseGuards(CompanyRoleGuard)
export class EmailsController {
  constructor(
    @Inject(EmailsService)
    private readonly service: EmailsService,
  ) {}

  @Get()
  @RequirePermission("email", "read")
  async list(@CompanyId() companyId: string, @Query() rawQuery: unknown) {
    const parsed = emailListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid email list query",
        code: "INVALID_EMAIL_PAYLOAD",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get("statistics")
  @RequirePermission("email", "read")
  async statistics(@CompanyId() companyId: string) {
    return this.service.statistics(companyId);
  }

  @Post("sync")
  @HttpCode(200)
  @RequirePermission("email", "read")
  async sync(@CompanyId() companyId: string) {
    return this.service.sync(companyId);
  }

  @Post("draft")
  @RequirePermission("email", "send")
  async saveDraft(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = emailDraftSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid email payload",
        code: "INVALID_EMAIL_PAYLOAD",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.saveDraft(companyId, userId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("email", "read")
  async findOne(@CompanyId() companyId: string, @Param("id") id: string) {
    return this.service.findOne(companyId, id);
  }

  @Post()
  @RequirePermission("email", "send")
  async send(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = emailComposeSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid email payload",
        code: "INVALID_EMAIL_PAYLOAD",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.send(companyId, userId, parsed.data);
  }

  @Post(":id/send")
  @RequirePermission("email", "send")
  async sendDraft(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param("id") id: string,
  ) {
    return this.service.sendDraft(companyId, userId, id);
  }

  @Post(":id/restore")
  @RequirePermission("email", "delete")
  async restore(@CompanyId() companyId: string, @Param("id") id: string) {
    return this.service.restore(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("email", "read")
  async update(
    @CompanyId() companyId: string,
    @MembershipRoleParam() role: MembershipRole,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = emailUpdateSchema.merge(emailDraftSchema).safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid email payload",
        code: "INVALID_EMAIL_PAYLOAD",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, role, id, parsed.data);
  }

  @Delete(":id/permanent")
  @RequirePermission("email", "delete")
  async permanentDelete(@CompanyId() companyId: string, @Param("id") id: string) {
    await this.service.permanentDelete(companyId, id);
    return { ok: true };
  }

  @Delete(":id")
  @RequirePermission("email", "delete")
  async moveToTrash(@CompanyId() companyId: string, @Param("id") id: string) {
    return this.service.moveToTrash(companyId, id);
  }
}
