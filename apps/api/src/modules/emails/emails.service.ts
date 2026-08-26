import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { Email, EmailFolder, MembershipRole, Prisma } from "@medcal/db";
import { loadEnv } from "@medcal/config";
import { email as notificationsEmail } from "@medcal/notifications";
import {
  EMAIL_SORTABLE_FIELDS,
  type EmailComposeInput,
  type EmailDraftInput,
  type EmailListQuery,
  type EmailUpdateInput,
} from "@medcal/shared";
import { hasPermission } from "@medcal/auth";
import { resolveSortOrder } from "../../common/sort-query";
import { QuotationsService } from "../quotations/quotations.service";
import { emailNotConfigured, smtpDeliveryFailed } from "./email-errors";
import { ImapSyncService } from "./imap-sync.service";
import { LeadSuggestionService } from "./lead-suggestion.service";

const DEFAULT_PAGE_SIZE = 20;

export type EmailMailer = {
  sendEmail: typeof notificationsEmail.sendEmail;
};

type SmtpConfig = Parameters<EmailMailer["sendEmail"]>[1];

export type EmailListRow = {
  id: string;
  folder: EmailFolder;
  status: Email["status"];
  isStarred: boolean;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  snippet: string;
  sentAt: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  suggestedLead: { id: string; name: string } | null;
  lead: { id: string; name: string } | null;
};

export type EmailListResult = {
  data: EmailListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type LeadSummary = { id: string; name: string; email: string };

export type EmailDetail = Email & {
  suggestedLead: LeadSummary | null;
  lead: LeadSummary | null;
  leadCandidates: LeadSummary[];
  contactMessage: { id: string; subject: string | null } | null;
  sentBy: { id: string; name: string | null } | null;
  parentEmail: { id: string; subject: string } | null;
};

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    @Inject(LeadSuggestionService)
    private readonly suggestions: LeadSuggestionService,
    @Inject(ImapSyncService)
    private readonly imapSync: ImapSyncService,
    @Inject(QuotationsService)
    private readonly quotations: QuotationsService,
  ) {}

  mailer: EmailMailer = { sendEmail: notificationsEmail.sendEmail };

  async findAll(companyId: string, query: EmailListQuery): Promise<EmailListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const folder = query.folder;

    const where: Prisma.EmailWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.isStarred === true ? { isStarred: true } : {}),
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.search
        ? {
            OR: [
              { subject: { contains: query.search, mode: "insensitive" } },
              { fromEmail: { contains: query.search, mode: "insensitive" } },
              { toEmail: { contains: query.search, mode: "insensitive" } },
              { fromName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(folder === "TRASH"
        ? { deletedAt: { not: null } }
        : {
            deletedAt: null,
            ...(folder ? { folder } : {}),
          }),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      EMAIL_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, rows] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          suggestedLead: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        folder: row.folder,
        status: row.status,
        isStarred: row.isStarred,
        fromEmail: row.fromEmail,
        fromName: row.fromName,
        toEmail: row.toEmail,
        subject: row.subject,
        snippet: snippetOf(row.textBody || row.body),
        sentAt: row.sentAt,
        receivedAt: row.receivedAt,
        createdAt: row.createdAt,
        deletedAt: row.deletedAt,
        suggestedLead: row.suggestedLead,
        lead: row.lead,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async statistics(companyId: string) {
    const [inbox, sent, drafts, trash, unread] = await Promise.all([
      prisma.email.count({ where: { companyId, folder: "INBOX", deletedAt: null } }),
      prisma.email.count({ where: { companyId, folder: "SENT", deletedAt: null } }),
      prisma.email.count({ where: { companyId, folder: "DRAFTS", deletedAt: null } }),
      prisma.email.count({ where: { companyId, deletedAt: { not: null } } }),
      prisma.email.count({
        where: { companyId, folder: "INBOX", status: "UNREAD", deletedAt: null },
      }),
    ]);
    return { inbox, sent, drafts, trash, unread };
  }

  async findOne(companyId: string, id: string): Promise<EmailDetail> {
    const email = await prisma.email.findFirst({
      where: { id, companyId },
      include: {
        suggestedLead: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, name: true, email: true } },
        contactMessage: { select: { id: true, subject: true } },
        sentBy: { select: { id: true, name: true } },
        parentEmail: { select: { id: true, subject: true } },
      },
    });
    if (!email) {
      throw new NotFoundException({ message: "Email not found", code: "EMAIL_NOT_FOUND" });
    }

    const suggestion = await this.suggestions.findSuggestion(companyId, email.fromEmail);
    return { ...email, leadCandidates: suggestion.candidates };
  }

  async listForLead(companyId: string, leadId: string): Promise<EmailListResult> {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId }, select: { id: true } });
    if (!lead) {
      throw new NotFoundException({ message: "Lead not found", code: "LEAD_NOT_FOUND" });
    }
    return this.findAll(companyId, { leadId, page: 1, pageSize: 100 });
  }

  async send(companyId: string, userId: string, input: EmailComposeInput): Promise<Email> {
    const parent = input.parentEmailId
      ? await this.requireEmail(companyId, input.parentEmailId)
      : null;
    const contact = await this.resolveContactMessage(companyId, input.contactMessageId);
    let leadId: string | null = null;
    if (input.leadId) {
      leadId = await this.requireLead(companyId, input.leadId);
    } else if (contact?.leadId) {
      leadId = contact.leadId;
    }

    const rfcInReplyTo = parent?.messageId ?? null;
    const rfcReferences = buildReferences(parent?.rfcReferences, parent?.messageId);

    const quotationAttachment = input.quotationId
      ? await this.quotations.buildPdf(companyId, input.quotationId)
      : null;

    const smtp = smtpConfig();

    let result: { messageId: string };
    try {
      result = await this.mailer.sendEmail(
        {
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          html: input.body,
          text: input.body,
          inReplyTo: rfcInReplyTo ?? undefined,
          references: rfcReferences ?? undefined,
          attachments: quotationAttachment
            ? [
                {
                  filename: quotationAttachment.filename,
                  content: quotationAttachment.buffer,
                  contentType: "application/pdf",
                },
              ]
            : undefined,
        },
        smtp,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "SMTP delivery failed";
      if (message.startsWith("EMAIL_NOT_CONFIGURED")) {
        throw emailNotConfigured();
      }
      this.logger.warn(`SMTP send failed: ${classifySmtpError(message)}`);
      throw smtpDeliveryFailed();
    }

    const fromEmail = parseFromAddress(smtp.from) || smtp.user;

    const created = await prisma.email.create({
      data: {
        companyId,
        messageId: result.messageId || null,
        fromEmail,
        toEmail: input.to,
        ccEmail: input.cc ?? null,
        bccEmail: input.bcc ?? null,
        subject: input.subject,
        body: input.body,
        textBody: input.body,
        folder: "SENT",
        status: "READ",
        parentEmailId: parent?.id ?? null,
        rfcInReplyTo,
        rfcReferences,
        leadId,
        suggestedLeadId: null,
        contactMessageId: contact?.id ?? null,
        sentByUserId: userId,
        sentAt: new Date(),
        readAt: new Date(),
      },
    });
    this.logger.log(`SMTP send persisted id=${created.id} messageId=${created.messageId ? "set" : "missing"}`);

    if (input.quotationId) {
      try {
        await this.quotations.send(companyId, input.quotationId);
      } catch (err) {
        this.logger.warn(
          `Quotation ${input.quotationId} was not marked SENT after email ${created.id}: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        );
      }
    }

    return created;
  }

  async saveDraft(companyId: string, userId: string, input: EmailDraftInput): Promise<Email> {
    const parent = input.parentEmailId
      ? await this.requireEmail(companyId, input.parentEmailId)
      : null;
    const contact = await this.resolveContactMessage(companyId, input.contactMessageId);
    const smtp = smtpConfigOrNull();
    const fromEmail = smtp ? parseFromAddress(smtp.from) || smtp.user : "";

    return prisma.email.create({
      data: {
        companyId,
        fromEmail: fromEmail || "draft@local",
        toEmail: input.to || "",
        ccEmail: input.cc ?? null,
        bccEmail: input.bcc ?? null,
        subject: input.subject || "",
        body: input.body || "",
        textBody: input.body || "",
        folder: "DRAFTS",
        status: "READ",
        parentEmailId: parent?.id ?? null,
        contactMessageId: contact?.id ?? null,
        sentByUserId: userId,
      },
    });
  }

  async updateDraft(companyId: string, id: string, input: EmailDraftInput): Promise<Email> {
    const email = await this.requireEmail(companyId, id);
    if (email.folder !== "DRAFTS" || email.deletedAt) {
      throw new BadRequestException({ message: "Email is not a draft", code: "INVALID_EMAIL_PAYLOAD" });
    }
    return prisma.email.update({
      where: { id: email.id },
      data: {
        ...(input.to !== undefined ? { toEmail: input.to } : {}),
        ...(input.cc !== undefined ? { ccEmail: input.cc } : {}),
        ...(input.bcc !== undefined ? { bccEmail: input.bcc } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.body !== undefined ? { body: input.body, textBody: input.body } : {}),
      },
    });
  }

  async sendDraft(companyId: string, userId: string, id: string): Promise<Email> {
    const draft = await this.requireEmail(companyId, id);
    if (draft.folder !== "DRAFTS" || draft.deletedAt) {
      throw new BadRequestException({ message: "Email is not a draft", code: "INVALID_EMAIL_PAYLOAD" });
    }
    if (!draft.toEmail || !draft.subject || !draft.body) {
      throw new BadRequestException({
        message: "Draft is missing to, subject, or body",
        code: "INVALID_EMAIL_PAYLOAD",
      });
    }

    const sent = await this.send(companyId, userId, {
      to: draft.toEmail,
      cc: draft.ccEmail ?? undefined,
      bcc: draft.bccEmail ?? undefined,
      subject: draft.subject,
      body: draft.body,
      parentEmailId: draft.parentEmailId ?? undefined,
      contactMessageId: draft.contactMessageId ?? undefined,
      leadId: draft.leadId ?? undefined,
    });

    await prisma.email.delete({ where: { id: draft.id } });
    return sent;
  }

  async update(
    companyId: string,
    role: MembershipRole,
    id: string,
    input: EmailUpdateInput & EmailDraftInput,
  ): Promise<Email> {
    const email = await this.requireEmail(companyId, id);
    const draftFields =
      input.to !== undefined ||
      input.cc !== undefined ||
      input.bcc !== undefined ||
      input.subject !== undefined ||
      input.body !== undefined;

    if (draftFields) {
      if (!hasPermission(role, "email", "send")) {
        throw new ForbiddenException("Forbidden");
      }
      return this.updateDraft(companyId, id, input);
    }

    if (input.leadId !== undefined) {
      if (!hasPermission(role, "email", "manage")) {
        throw new ForbiddenException("Forbidden");
      }
      return this.associateLead(companyId, id, input.leadId);
    }

    if (input.suggestedLeadId !== undefined) {
      if (input.suggestedLeadId !== null) {
        throw new BadRequestException({
          message: "suggestedLeadId can only be cleared",
          code: "INVALID_EMAIL_PAYLOAD",
        });
      }
      return prisma.email.update({
        where: { id: email.id },
        data: { suggestedLeadId: null },
      });
    }

    const data: Prisma.EmailUpdateInput = {};
    if (input.status) {
      data.status = input.status;
      data.readAt = input.status === "READ" ? new Date() : null;
    }
    if (input.isStarred !== undefined) {
      data.isStarred = input.isStarred;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ message: "No valid fields to update", code: "INVALID_EMAIL_PAYLOAD" });
    }
    return prisma.email.update({ where: { id: email.id }, data });
  }

  async associateLead(companyId: string, emailId: string, leadId: string | null): Promise<Email> {
    const email = await this.requireEmail(companyId, emailId);
    if (leadId === null) {
      return prisma.email.update({
        where: { id: email.id },
        data: { leadId: null, suggestedLeadId: null },
      });
    }
    await this.requireLead(companyId, leadId);
    return prisma.email.update({
      where: { id: email.id },
      data: { leadId, suggestedLeadId: null },
    });
  }

  async moveToTrash(companyId: string, id: string): Promise<Email> {
    const email = await this.requireEmail(companyId, id);
    return prisma.email.update({
      where: { id: email.id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(companyId: string, id: string): Promise<Email> {
    const email = await this.requireEmail(companyId, id);
    if (!email.deletedAt) {
      throw new BadRequestException({ message: "Email is not in trash", code: "INVALID_EMAIL_PAYLOAD" });
    }
    return prisma.email.update({
      where: { id: email.id },
      data: { deletedAt: null },
    });
  }

  async permanentDelete(companyId: string, id: string): Promise<void> {
    const email = await this.requireEmail(companyId, id);
    if (!email.deletedAt) {
      throw new BadRequestException({
        message: "Permanent delete requires the email to be in trash",
        code: "INVALID_EMAIL_PAYLOAD",
      });
    }
    await prisma.email.delete({ where: { id: email.id } });
  }

  async sync(companyId: string) {
    return this.imapSync.syncInbox(companyId);
  }

  private async requireEmail(companyId: string, id: string): Promise<Email> {
    const email = await prisma.email.findFirst({ where: { id, companyId } });
    if (!email) {
      throw new NotFoundException({ message: "Email not found", code: "EMAIL_NOT_FOUND" });
    }
    return email;
  }

  private async requireLead(companyId: string, leadId: string): Promise<string> {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId }, select: { id: true } });
    if (!lead) {
      throw new NotFoundException({ message: "Lead not found", code: "LEAD_NOT_FOUND" });
    }
    return lead.id;
  }

  private async resolveContactMessage(companyId: string, contactMessageId?: string) {
    if (!contactMessageId) return null;
    const message = await prisma.contactMessage.findFirst({
      where: { id: contactMessageId, companyId },
      select: { id: true, leadId: true },
    });
    if (!message) {
      throw new NotFoundException({ message: "Contact message not found", code: "EMAIL_NOT_FOUND" });
    }
    return message;
  }
}

function snippetOf(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function smtpConfig(): SmtpConfig {
  const env = loadEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw emailNotConfigured();
  }
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || env.SMTP_USER,
    rejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
  };
}

function smtpConfigOrNull(): SmtpConfig | null {
  try {
    return smtpConfig();
  } catch {
    return null;
  }
}

function parseFromAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] || from).trim();
}

function buildReferences(existing: string | null | undefined, parentMessageId: string | null | undefined): string | null {
  if (!parentMessageId) return existing ?? null;
  if (!existing) return parentMessageId;
  if (existing.includes(parentMessageId)) return existing;
  return `${existing} ${parentMessageId}`;
}

function classifySmtpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("auth")) return "authentication_failure";
  if (lower.includes("connect") || lower.includes("econn")) return "unavailable";
  return "delivery_failed";
}
