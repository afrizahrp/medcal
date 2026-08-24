import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CompanyRoleGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
