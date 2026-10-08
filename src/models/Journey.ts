import { Schema, model, Document } from "mongoose";

export interface IJourney extends Document {
  slug: string;
  from: string;
  to: string;
  distanceKm: number;
  driveTime: string;
  highlight: string;
  image: { url: string; publicId: string };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const journeySchema = new Schema<IJourney>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    distanceKm: { type: Number, required: true },
    driveTime: { type: String, required: true },
    highlight: { type: String, required: true },
    image: { url: { type: String, required: true }, publicId: { type: String, required: true } },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Journey = model<IJourney>("Journey", journeySchema);
