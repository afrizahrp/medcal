import { Controller, Get } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

@Controller("health")
export class HealthController {
  @Get()
  @AllowAnonymous()
  getHealth() {
    return { ok: true, service: "api" };
  }
}
