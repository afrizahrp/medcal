import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { FilesModule } from "../files/files.module";
import { FileOwnerPolicyRegistry } from "../files/owner-policy";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import { CalibrationJobsService } from "./calibration-jobs.service";
import { identityCorrectionFileOwnerPolicy } from "./identity-correction-file-owner-policy";
import { MeasurementResultsService } from "./measurement-results.service";

@Module({
  imports: [FilesModule],
  controllers: [CalibrationJobsController],
  providers: [CalibrationJobsService, MeasurementResultsService, CompanyRoleGuard],
  exports: [CalibrationJobsService, MeasurementResultsService],
})
export class CalibrationJobsModule implements OnModuleInit {
  constructor(
    @Inject(FileOwnerPolicyRegistry)
    private readonly fileOwnerPolicies: FileOwnerPolicyRegistry,
  ) {}

  onModuleInit(): void {
    this.fileOwnerPolicies.register(identityCorrectionFileOwnerPolicy);
  }
}
