import { Schema, model, Document } from "mongoose";
import { imageRefSchema, IImageRef } from "./seoFields";

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
    /** Kilometres included per completed 24 hours of rental. */
    kmPerDay: number;
    /** ₹ per km beyond the allowance, for cars without their own rate. */
    extraKmRate: number;
    cancellationRulesText?: string;
  };
  seo: {
    defaultSeoTitle?: string;
    defaultDescription?: string;
    defaultOgImage?: IImageRef;
    /** schema.org LocalBusiness subtype used for the site-wide business schema. */
    businessType: string;
    priceRange?: string;
    /** schema.org openingHours, e.g. "Mo-Su 00:00-23:59". */
    openingHours?: string;
    areaServed: string[];
    latitude?: number;
    longitude?: number;
  };
  updatedAt: Date;
}

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, default: "GLOBAL", unique: true },
    companyName: { type: String, default: "Ride to Road" },
    logo: { url: String, publicId: String },
    whatsappNumber: { type: String, default: "917303939372" },
    phone: { type: String },
    email: { type: String },
    address: { type: String },
    socialLinks: { instagram: String, facebook: String, youtube: String, x: String },
    booking: {
      minRentalHours: { type: Number, default: 4 },
      maxRentalDays: { type: Number, default: 30 },
      taxPercent: { type: Number, default: 0 },
      kmPerDay: { type: Number, default: 300, min: 0 },
      extraKmRate: { type: Number, default: 7, min: 0 },
      cancellationRulesText: { type: String },
    },
    seo: {
      defaultSeoTitle: { type: String, default: "Ride to Road - Self Drive, Your Way" },
      defaultDescription: { type: String },
      defaultOgImage: { type: imageRefSchema },
      businessType: { type: String, default: "AutoRental" },
      priceRange: { type: String, trim: true },
      openingHours: { type: String, trim: true },
      areaServed: { type: [String], default: [] },
      latitude: { type: Number },
      longitude: { type: Number },
    },
  },
  { timestamps: true }
);

export const Setting = model<ISetting>("Setting", settingSchema);
