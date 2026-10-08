import { Schema, model, Document } from "mongoose";

export interface ITestimonial extends Document {
  name: string;
  location?: string;
  rating: number;
  quote: string;
  car?: string;
  isFeatured: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const testimonialSchema = new Schema<ITestimonial>(
  {
    name: { type: String, required: true },
    location: { type: String },
    rating: { type: Number, required: true, min: 1, max: 5 },
    quote: { type: String, required: true },
    car: { type: String },
    isFeatured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

testimonialSchema.index({ isPublished: 1, isFeatured: 1 });

export const Testimonial = model<ITestimonial>("Testimonial", testimonialSchema);
