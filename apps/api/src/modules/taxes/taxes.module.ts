import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { TaxesController } from "./taxes.controller";
import { TaxesService } from "./taxes.service";

@Module({
  controllers: [TaxesController],
  providers: [TaxesService, CompanyRoleGuard],
  exports: [TaxesService],
})
export class TaxesModule {}
