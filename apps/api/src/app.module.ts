import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "@medcal/auth";
import { HealthController } from "./health.controller";
import { ContactMessagesModule } from "./modules/contact-messages/contact-messages.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { WhitelistModule } from "./modules/whitelist/whitelist.module";
import { MeModule } from "./modules/me/me.module";
import { ChatModule } from "./modules/chat/chat.module";
import { UsersModule } from "./modules/users/users.module";
import { MenuModule } from "./modules/menu/menu.module";
import { EmailsModule } from "./modules/emails/emails.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { PushTokensModule } from "./modules/push-tokens/push-tokens.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { CalibrationRequestsModule } from "./modules/calibration-requests/calibration-requests.module";
import { UomsModule } from "./modules/uoms/uoms.module";
import { DeviceCategoriesModule } from "./modules/device-categories/device-categories.module";
import { DeviceTypesModule } from "./modules/device-types/device-types.module";

@Module({
  imports: [
    AuthModule.forRoot({ auth, isGlobal: true }),
    ContactMessagesModule,
    LeadsModule,
    CustomersModule,
    CalibrationRequestsModule,
    UomsModule,
    DeviceCategoriesModule,
    DeviceTypesModule,
    WhitelistModule,
    MeModule,
    ChatModule,
    UsersModule,
    MenuModule,
    EmailsModule,
    PermissionsModule,
    PushTokensModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
