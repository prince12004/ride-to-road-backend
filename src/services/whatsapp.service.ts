import { env } from "../config/env";

export function generateGenericWhatsAppUrl(message: string, whatsappNumber?: string): string {
  const number = (whatsappNumber ?? env.defaultWhatsappNumber).replace(/\D/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
