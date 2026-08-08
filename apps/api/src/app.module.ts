import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { ContactMessagesModule } from "./modules/contact-messages/contact-messages.module";

@Module({
  imports: [ContactMessagesModule],
  controllers: [HealthController],
})
export class AppModule {}
