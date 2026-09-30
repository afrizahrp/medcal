import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { CertificateVerificationController } from "./certificate-verification.controller";
import { CertificateVerificationService } from "./certificate-verification.service";

@Module({
  imports: [FilesModule],
  controllers: [CertificateVerificationController],
  providers: [CertificateVerificationService],
})
export class CertificateVerificationModule {}
