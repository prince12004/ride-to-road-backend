import { Schema, model, Document } from "mongoose";

export interface ILocation extends Document {
  city: string;
  region: string;
  slug: string;
  address?: string;
  image?: { url: string; publicId: string };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<ILocation>(
  {
    city: { type: String, required: true, trim: true },
    region: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    address: { type: String, trim: true },
    image: { url: String, publicId: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Location = model<ILocation>("Location", locationSchema);
