import { Inject, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@medcal/db";
import { loadEnv } from "@medcal/config";
import { emailNotConfigured, imapSyncFailed } from "./email-errors";
import { fetchInboxFromHostinger, imapSyncLimit, type FetchedImapMessage } from "./imap-client";
import { LeadSuggestionService } from "./lead-suggestion.service";

export type ImapSyncResult = {
  success: true;
  fetched: number;
  created: number;
  duplicates: number;
  skippedMalformed: number;
  suggested: number;
};

@Injectable()
export class ImapSyncService {
  private readonly logger = new Logger(ImapSyncService.name);

  constructor(
    @Inject(LeadSuggestionService)
    private readonly suggestions: LeadSuggestionService,
  ) {}

  async syncInbox(
    companyId: string,
    fetchFn: () => Promise<FetchedImapMessage[]> = fetchInboxFromHostinger,
  ): Promise<ImapSyncResult> {
    const env = loadEnv();
    if (!env.IMAP_HOST || !env.IMAP_USER || !env.IMAP_PASS) {
      throw emailNotConfigured("IMAP is not configured");
    }

    this.logger.log(`IMAP sync start companyId=${companyId} mailbox=INBOX limit=${imapSyncLimit()}`);

    let fetchedMessages: FetchedImapMessage[];
    try {
      fetchedMessages = await fetchFn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "IMAP sync failed";
      if (message === "EMAIL_NOT_CONFIGURED") {
        throw emailNotConfigured("IMAP is not configured");
      }
      this.logger.warn(`IMAP sync failed: ${message}`);
      throw imapSyncFailed();
    }

    const fetched = fetchedMessages.length;
    let created = 0;
    let duplicates = 0;
    let skippedMalformed = 0;
    let suggested = 0;

    for (const msg of fetchedMessages) {
      if (!msg.fromEmail) {
        skippedMalformed += 1;
        continue;
      }

      const messageId = msg.messageId?.trim() || null;
      if (messageId) {
        const existing = await prisma.email.findFirst({
          where: { companyId, messageId },
          select: { id: true },
        });
        if (existing) {
          duplicates += 1;
          continue;
        }
      }

      const suggestion = await this.suggestions.findSuggestion(companyId, msg.fromEmail);

      try {
        await prisma.email.create({
          data: {
            companyId,
            messageId,
            fromEmail: msg.fromEmail,
            fromName: msg.fromName,
            toEmail: msg.toEmail || env.IMAP_USER || "",
            toName: msg.toName,
            ccEmail: msg.ccEmail,
            subject: msg.subject || "(no subject)",
            body: msg.body || "",
            textBody: msg.textBody,
            folder: "INBOX",
            status: "UNREAD",
            rfcInReplyTo: msg.rfcInReplyTo,
            rfcReferences: msg.rfcReferences,
            suggestedLeadId: suggestion.suggestedLeadId,
            leadId: null,
            receivedAt: msg.receivedAt,
          },
        });
        created += 1;
        if (suggestion.suggestedLeadId) suggested += 1;
      } catch (err) {
        const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
        if (code === "P2002") {
          duplicates += 1;
          continue;
        }
        skippedMalformed += 1;
        this.logger.warn(`Skipped IMAP message persist: ${err instanceof Error ? err.message : "error"}`);
      }
    }

    this.logger.log(
      `IMAP sync end fetched=${fetched} created=${created} duplicates=${duplicates} skipped=${skippedMalformed} suggested=${suggested}`,
    );

    return {
      success: true,
      fetched,
      created,
      duplicates,
      skippedMalformed,
      suggested,
    };
  }
}
