import { Schema, model, Document } from "mongoose";

export type SiteContentKey =
  | "about-us"
  | "contact-us"
  | "terms-and-conditions"
  | "cancellation-policy"
  | "refund-policy";

export const SITE_CONTENT_KEYS: SiteContentKey[] = [
  "about-us",
  "contact-us",
  "terms-and-conditions",
  "cancellation-policy",
  "refund-policy",
];

export interface ISiteContent extends Document {
  key: SiteContentKey;
  title: string;
  content: string;
  updatedAt: Date;
}

const siteContentSchema = new Schema<ISiteContent>(
  {
    key: { type: String, required: true, unique: true, enum: SITE_CONTENT_KEYS },
    title: { type: String, required: true },
    content: { type: String, default: "" },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const SiteContent = model<ISiteContent>("SiteContent", siteContentSchema);
