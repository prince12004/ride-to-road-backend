import { Schema, model, Document, Types } from "mongoose";

export interface ICouponUsage extends Document {
  coupon: Types.ObjectId;
  mobile: string;
  booking: Types.ObjectId;
  discountApplied: number;
  createdAt: Date;
}

const couponUsageSchema = new Schema<ICouponUsage>(
  {
    coupon: { type: Schema.Types.ObjectId, ref: "Coupon", required: true },
    mobile: { type: String, required: true },
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    discountApplied: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

couponUsageSchema.index({ coupon: 1, mobile: 1 });

export const CouponUsage = model<ICouponUsage>("CouponUsage", couponUsageSchema);
