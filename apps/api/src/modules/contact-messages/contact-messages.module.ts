import { Module } from "@nestjs/common";
import { ContactMessagesController } from "./contact-messages.controller";
import { ContactMessagesService } from "./contact-messages.service";

@Module({
  controllers: [ContactMessagesController],
  providers: [ContactMessagesService],
})
export class ContactMessagesModule {}
