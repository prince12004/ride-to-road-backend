import { Schema, model, Document, Types } from "mongoose";
import { DiscountType } from "../types/enums";

export interface ICoupon extends Document {
  code: string;
  description?: string;
  discountType: DiscountType;
  percentage?: number;
  fixedAmount?: number;
  minBookingAmount?: number;
  maxDiscount?: number;
  applicableCars: Types.ObjectId[];
  usageLimit?: number;
  perUserLimit?: number;
  usedCount: number;
  startDate: Date;
  expiryDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String },
    discountType: { type: String, enum: Object.values(DiscountType), required: true },
    percentage: { type: Number, min: 0, max: 100 },
    fixedAmount: { type: Number, min: 0 },
    minBookingAmount: { type: Number, min: 0, default: 0 },
    maxDiscount: { type: Number, min: 0 },
    applicableCars: [{ type: Schema.Types.ObjectId, ref: "Car" }],
    usageLimit: { type: Number },
    perUserLimit: { type: Number },
    usedCount: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ isActive: 1 });

export const Coupon = model<ICoupon>("Coupon", couponSchema);
