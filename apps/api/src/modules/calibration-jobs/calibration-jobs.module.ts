import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { FilesModule } from "../files/files.module";
import { FileOwnerPolicyRegistry } from "../files/owner-policy";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import { CalibrationJobsService } from "./calibration-jobs.service";
import { identityCorrectionFileOwnerPolicy } from "./identity-correction-file-owner-policy";
import { MeasurementResultsService } from "./measurement-results.service";
import { PhysicalCheckResultsService } from "./physical-check-results.service";

@Module({
  imports: [FilesModule],
  controllers: [CalibrationJobsController],
  providers: [
    CalibrationJobsService,
    MeasurementResultsService,
    PhysicalCheckResultsService,
    CompanyRoleGuard,
  ],
  exports: [CalibrationJobsService, MeasurementResultsService, PhysicalCheckResultsService],
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
