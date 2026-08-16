import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { InternalServiceGuard } from "../../common/guards/internal-service.guard";
import { serializeChatMessage } from "./chat-serialization";
import { ChatSessionsService } from "./chat-sessions.service";

/**
 * Internal, service-to-service endpoint (same trust boundary as
 * POST internal/contact-messages) — this is what a future apps/web-api
 * public route would forward to, not something a browser calls directly.
 * Phase 1 deliberately stops here: see the Web Chat Phase 1 implementation
 * report for why the public apps/web-api route (CAPTCHA + dedicated rate
 * limiter + ChatSessionToken issuance) is not built in this phase.
 */
@Controller("internal/chat-sessions")
export class ChatSessionsController {
  constructor(
    @Inject(ChatSessionsService)
    private readonly service: ChatSessionsService,
  ) {}

  @Post()
  @AllowAnonymous()
  @UseGuards(InternalServiceGuard)
  async create(@Body() body: unknown, @CompanyId() companyId: string) {
    // messages[].seq is a BigInt at runtime (see chat-serialization.ts) —
    // Express's JSON response encoder can't serialize it. Phase 1 never hit
    // this because nothing consumed this endpoint's JSON body yet; Phase
    // 2's apps/web-api forward (POST /public/chat-sessions) does.
    const session = await this.service.createSession(companyId, body);
    return { ...session, messages: session.messages.map(serializeChatMessage) };
  }
}
