import { Schema, model, Document } from "mongoose";

export interface IOffer extends Document {
  eyebrow: string;
  title: string;
  description: string;
  terms?: string;
  code?: string;
  image: { url: string; publicId: string };
  ctaLabel: string;
  ctaHref: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const offerSchema = new Schema<IOffer>(
  {
    eyebrow: { type: String, default: "Limited offer" },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    terms: { type: String },
    code: { type: String, trim: true, uppercase: true },
    image: { url: { type: String, required: true }, publicId: { type: String, required: true } },
    ctaLabel: { type: String, default: "Claim Offer" },
    ctaHref: { type: String, default: "/cars" },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

offerSchema.index({ isActive: 1 });

export const Offer = model<IOffer>("Offer", offerSchema);
