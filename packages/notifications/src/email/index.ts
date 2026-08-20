import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type SendEmailInput = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
};

export type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  rejectUnauthorized?: boolean;
};

let transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;
let currentConfig: SmtpConfig | null = null;

function getTransporter(
  config: SmtpConfig
): Transporter<SMTPTransport.SentMessageInfo> {
  const configChanged =
    !currentConfig ||
    currentConfig.host !== config.host ||
    currentConfig.port !== config.port ||
    currentConfig.user !== config.user ||
    currentConfig.pass !== config.pass;

  if (!transporter || configChanged) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        rejectUnauthorized: config.rejectUnauthorized ?? true,
      },
    });
    currentConfig = config;
  }

  return transporter;
}

export async function sendEmail(
  input: SendEmailInput,
  config: SmtpConfig
): Promise<SendEmailResult> {
  if (!config.host || !config.user || !config.pass) {
    throw new Error("EMAIL_NOT_CONFIGURED: SMTP credentials missing");
  }

  const transport = getTransporter(config);

  const mailOptions: nodemailer.SendMailOptions = {
    from: config.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    inReplyTo: input.inReplyTo,
    references: input.references,
  };

  const result = await transport.sendMail(mailOptions);

  return {
    messageId: result.messageId,
    accepted: Array.isArray(result.accepted)
      ? result.accepted.map((a) => (typeof a === "string" ? a : a.address))
      : [],
    rejected: Array.isArray(result.rejected)
      ? result.rejected.map((r) => (typeof r === "string" ? r : r.address))
      : [],
  };
}

export async function verifySmtpConnection(config: SmtpConfig): Promise<boolean> {
  if (!config.host || !config.user || !config.pass) {
    return false;
  }

  try {
    const transport = getTransporter(config);
    await transport.verify();
    return true;
  } catch {
    return false;
  }
}
