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
import { QuotationsModule } from "./modules/quotations/quotations.module";
import { PurchaseOrdersModule } from "./modules/purchase-orders/purchase-orders.module";
import { WorkOrdersModule } from "./modules/work-orders/work-orders.module";
import { CalibrationJobsModule } from "./modules/calibration-jobs/calibration-jobs.module";
import { UomsModule } from "./modules/uoms/uoms.module";
import { DeviceCategoriesModule } from "./modules/device-categories/device-categories.module";
import { DeviceTypesModule } from "./modules/device-types/device-types.module";
import { DeviceTypeAliasesModule } from "./modules/device-type-aliases/device-type-aliases.module";
import { DeviceModelsModule } from "./modules/device-models/device-models.module";
import { DeviceCapabilitiesModule } from "./modules/device-capabilities/device-capabilities.module";
import { DeviceCalibrationParametersModule } from "./modules/device-calibration-parameters/device-calibration-parameters.module";
import { DevicesModule } from "./modules/devices/devices.module";
import { EquipmentModule } from "./modules/equipment/equipment.module";
import { EquipmentCalibrationRecordsModule } from "./modules/equipment-calibration-records/equipment-calibration-records.module";
import { FilesModule } from "./modules/files/files.module";
import { TaxesModule } from "./modules/taxes/taxes.module";
import { PriceListItemsModule } from "./modules/price-list-items/price-list-items.module";

@Module({
  imports: [
    AuthModule.forRoot({ auth, isGlobal: true }),
    ContactMessagesModule,
    LeadsModule,
    CustomersModule,
    CalibrationRequestsModule,
    QuotationsModule,
    PurchaseOrdersModule,
    WorkOrdersModule,
    CalibrationJobsModule,
    UomsModule,
    DeviceCategoriesModule,
    DeviceTypesModule,
    DeviceTypeAliasesModule,
    DeviceModelsModule,
    DeviceCapabilitiesModule,
    DeviceCalibrationParametersModule,
    DevicesModule,
    EquipmentModule,
    FilesModule,
    EquipmentCalibrationRecordsModule,
    TaxesModule,
    PriceListItemsModule,
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
