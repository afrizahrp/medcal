import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { serializeChatMessage } from "./chat-serialization";
import { ChatSessionsService } from "./chat-sessions.service";

/**
 * Staff-facing REST reads for Chat Inbox / Chat Conversation (Phase 2 admin
 * UI) — same Better Auth session + CompanyRoleGuard + chat:read RBAC as
 * every other authenticated admin route (leads.controller.ts is the exact
 * precedent this mirrors). Real-time send/receive/close stays on
 * ChatGateway (Socket.IO); this controller exists only because the gateway
 * has no "list all my company's sessions" event and a REST-fetched initial
 * page load matches how Lead Inbox/Lead Detail already work.
 */
@Controller("chat-sessions")
@UseGuards(CompanyRoleGuard)
export class ChatSessionsAdminController {
  constructor(
    @Inject(ChatSessionsService)
    private readonly service: ChatSessionsService,
  ) {}

  @Get()
  @RequirePermission("chat", "read")
  async list(@CompanyId() companyId: string) {
    const sessions = await this.service.findAll(companyId);
    return sessions.map(({ latestMessage, ...session }) => ({
      ...session,
      latestMessage: latestMessage ? serializeChatMessage(latestMessage) : null,
    }));
  }

  // Declared before ":id" so "unread-count" is never captured as a
  // ChatSession id (same precedent as leads.controller.ts's
  // "needs-review"). Canonical unread count for the Management header's
  // Web Chat badge — see ChatSessionsService.countUnread.
  @Get("unread-count")
  @RequirePermission("chat", "read")
  async unreadCount(@CompanyId() companyId: string): Promise<{ count: number }> {
    const count = await this.service.countUnread(companyId);
    return { count };
  }

  @Get(":id")
  @RequirePermission("chat", "read")
  async findOne(@CompanyId() companyId: string, @Param("id") id: string) {
    const session = await this.service.findById(companyId, id);
    return { ...session, messages: session.messages.map(serializeChatMessage) };
  }

  // Body validation (readUpTo) lives in ChatSessionsService.markRead, same
  // convention as createSession/addMessage on this same service — the
  // controller stays a thin pass-through.
  @Patch(":id/read")
  @RequirePermission("chat", "read")
  async markRead(@CompanyId() companyId: string, @Param("id") id: string, @Body() rawBody: unknown) {
    return this.service.markRead(companyId, id, rawBody);
  }
}
