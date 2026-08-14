import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "@medcal/auth";
import { HealthController } from "./health.controller";
import { ContactMessagesModule } from "./modules/contact-messages/contact-messages.module";
import { WhitelistModule } from "./modules/whitelist/whitelist.module";

@Module({
  imports: [
    AuthModule.forRoot({ auth, isGlobal: true }),
    ContactMessagesModule,
    WhitelistModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
