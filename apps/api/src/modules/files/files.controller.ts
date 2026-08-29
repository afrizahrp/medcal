import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import type { MembershipRole } from "@medcal/db";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { MembershipRoleParam } from "../../common/decorators/membership-role.decorator";
import { UserId } from "../../common/decorators/user-id.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { MAX_UPLOAD_BYTES, type UploadedFile as UploadedFileShape } from "./files.constants";
import { FilesService } from "./files.service";

const uploadFieldsSchema = z.object({
  ownerType: z.string().trim().min(1).max(64),
  ownerId: z.string().trim().min(1).max(191),
});

/**
 * Generic authenticated file layer. Authorization is resolved through the
 * OWNER record's existing permission (via the registered FileOwnerPolicy),
 * never a dedicated `file:*` grant — so this controller carries
 * @UseGuards(CompanyRoleGuard) for session + membership, but no
 * @RequirePermission (the resource is dynamic per ownerType).
 */
@Controller("files")
@UseGuards(CompanyRoleGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly service: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @MembershipRoleParam() role: MembershipRole,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body() body: unknown,
  ) {
    const parsed = uploadFieldsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_FILE_UPLOAD",
        message: "Invalid upload fields",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.upload({
      companyId,
      userId,
      role,
      ownerType: parsed.data.ownerType,
      ownerId: parsed.data.ownerId,
      file,
    });
  }

  @Get(":id")
  async download(
    @CompanyId() companyId: string,
    @MembershipRoleParam() role: MembershipRole,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const { stream, fileObject } = await this.service.getForDownload(companyId, id, role);
    const safeName = (fileObject.originalName || fileObject.id).replace(/[\r\n"]/g, "_");
    return new StreamableFile(stream, {
      type: fileObject.mimeType ?? "application/octet-stream",
      disposition: `attachment; filename="${safeName}"`,
    });
  }

  @Delete(":id")
  async remove(
    @CompanyId() companyId: string,
    @MembershipRoleParam() role: MembershipRole,
    @Param("id") id: string,
  ) {
    return this.service.delete(companyId, id, role);
  }
}
