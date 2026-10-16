import { Schema, model, Document } from "mongoose";
import { CarLeadStatus } from "../types/enums";

/** A car owner who wants to attach their vehicle to the Ride to Road fleet. */
export interface ICarLead extends Document {
  name: string;
  mobile: string;
  carMakeModel: string;
  registrationNumber: string;
  manufacturingYear: number;
  city: string;
  details?: string;
  status: CarLeadStatus;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const carLeadSchema = new Schema<ICarLead>(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    carMakeModel: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    manufacturingYear: { type: Number, required: true },
    city: { type: String, required: true, trim: true },
    details: { type: String, trim: true },
    status: { type: String, enum: Object.values(CarLeadStatus), default: CarLeadStatus.NEW },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

carLeadSchema.index({ status: 1, createdAt: -1 });

export const CarLead = model<ICarLead>("CarLead", carLeadSchema);
