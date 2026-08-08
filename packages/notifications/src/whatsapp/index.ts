/** WhatsApp deep-link / API wrapper stub (bipmed patterns) */
export function buildWhatsAppDeepLink(
  phoneE164: string,
  text: string,
): string {
  const phone = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
