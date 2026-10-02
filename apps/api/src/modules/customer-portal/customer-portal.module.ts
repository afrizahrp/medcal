import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import {
  CustomerCalibrationJobsController,
  CustomerWorkOrdersController,
} from "./customer-portal.controller";
import { CustomerPortalService } from "./customer-portal.service";

@Module({
  imports: [FilesModule],
  controllers: [CustomerWorkOrdersController, CustomerCalibrationJobsController],
  providers: [CustomerPortalService],
})
export class CustomerPortalModule {}
