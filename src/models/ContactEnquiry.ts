import { Schema, model, Document } from "mongoose";
import { EnquiryStatus } from "../types/enums";

export interface IContactEnquiry extends Document {
  name: string;
  mobile: string;
  email?: string;
  message: string;
  status: EnquiryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const contactEnquirySchema = new Schema<IContactEnquiry>(
  {
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String },
    message: { type: String, required: true },
    status: { type: String, enum: Object.values(EnquiryStatus), default: EnquiryStatus.NEW },
  },
  { timestamps: true }
);

contactEnquirySchema.index({ status: 1, createdAt: -1 });

export const ContactEnquiry = model<IContactEnquiry>("ContactEnquiry", contactEnquirySchema);
