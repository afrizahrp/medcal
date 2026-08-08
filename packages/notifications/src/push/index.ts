/** Web Push adapter stub — VAPID send later */
export type SendPushInput = {
  endpoint: string;
  title: string;
  body: string;
  url?: string;
};

export async function sendPush(_input: SendPushInput): Promise<void> {
  return;
}
