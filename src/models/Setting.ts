import { Schema, model, Document } from "mongoose";

export interface ISetting extends Document {
  key: "GLOBAL";
  companyName: string;
  logo?: { url: string; publicId: string };
  whatsappNumber: string;
  phone?: string;
  email?: string;
  address?: string;
  socialLinks: { instagram?: string; facebook?: string; youtube?: string; x?: string };
  booking: {
    minRentalHours: number;
    maxRentalDays: number;
    taxPercent: number;
    cancellationRulesText?: string;
  };
  seo: { defaultSeoTitle?: string; defaultDescription?: string; defaultOgImage?: string };
  updatedAt: Date;
}

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, default: "GLOBAL", unique: true },
    companyName: { type: String, default: "Ride to Road" },
    logo: { url: String, publicId: String },
    whatsappNumber: { type: String, default: "919310811124" },
    phone: { type: String },
    email: { type: String },
    address: { type: String },
    socialLinks: { instagram: String, facebook: String, youtube: String, x: String },
    booking: {
      minRentalHours: { type: Number, default: 4 },
      maxRentalDays: { type: Number, default: 30 },
      taxPercent: { type: Number, default: 0 },
      cancellationRulesText: { type: String },
    },
    seo: {
      defaultSeoTitle: { type: String, default: "Ride to Road - Self Drive, Your Way" },
      defaultDescription: { type: String },
      defaultOgImage: { type: String },
    },
  },
  { timestamps: true }
);

export const Setting = model<ISetting>("Setting", settingSchema);
