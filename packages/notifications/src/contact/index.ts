/** Normalize contact / lead message payload for outbound confirmation */
export function formatContactAck(name: string): string {
  return `Terima kasih ${name}, pesan Anda sudah kami terima.`;
}
