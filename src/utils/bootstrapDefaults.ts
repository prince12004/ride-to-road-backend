import { Setting } from "../models/Setting";
import { SiteContent, SITE_CONTENT_KEYS, SiteContentKey } from "../models/SiteContent";
import { env } from "../config/env";

const TITLES: Record<SiteContentKey, string> = {
  "about-us": "About Us",
  "contact-us": "Contact Us",
  "terms-and-conditions": "Terms & Conditions",
  "cancellation-policy": "Cancellation Policy",
  "refund-policy": "Return & Refund Policy",
};

/**
 * Creates empty shell records so the admin panel always has something to
 * open and edit — no business copy is seeded, only structural placeholders.
 */
export async function bootstrapDefaults(): Promise<void> {
  const settingsExist = await Setting.exists({ key: "GLOBAL" });
  if (!settingsExist) {
    await Setting.create({ key: "GLOBAL", whatsappNumber: env.defaultWhatsappNumber });
  }

  for (const key of SITE_CONTENT_KEYS) {
    const exists = await SiteContent.exists({ key });
    if (!exists) {
      await SiteContent.create({ key, title: TITLES[key], content: "" });
    }
  }
}
