/** Email channel adapter stub — Nest NotificationsModule calls this */
export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(_input: SendEmailInput): Promise<void> {
  // Wire SMTP / provider in a later phase
  return;
}
