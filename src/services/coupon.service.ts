import { Types } from "mongoose";
import { Coupon, ICoupon } from "../models/Coupon";
import { CouponUsage } from "../models/CouponUsage";
import { ApiError } from "../utils/ApiError";
import { calculateCouponDiscount } from "./priceCalculator.service";

export async function validateCouponForBooking({
  code,
  carId,
  baseAmount,
  mobile,
}: {
  code: string;
  carId: string | Types.ObjectId;
  baseAmount: number;
  mobile?: string;
}): Promise<{ coupon: ICoupon; discountAmount: number }> {
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true });
  if (!coupon) throw new ApiError(404, "Invalid or inactive coupon code.");

  const now = new Date();
  if (now < coupon.startDate || now > coupon.expiryDate) {
    throw new ApiError(400, "This coupon has expired or is not yet active.");
  }
  if (coupon.applicableCars.length && !coupon.applicableCars.some((id) => String(id) === String(carId))) {
    throw new ApiError(400, "This coupon is not applicable to the selected car.");
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new ApiError(400, "This coupon has reached its usage limit.");
  }
  if (coupon.perUserLimit && mobile) {
    const usageCount = await CouponUsage.countDocuments({ coupon: coupon._id, mobile });
    if (usageCount >= coupon.perUserLimit) {
      throw new ApiError(400, "You have already used this coupon the maximum number of times.");
    }
  }
  if (coupon.minBookingAmount && baseAmount < coupon.minBookingAmount) {
    throw new ApiError(400, `This coupon requires a minimum booking amount of ₹${coupon.minBookingAmount}.`);
  }

  const discountAmount = calculateCouponDiscount(coupon, baseAmount);
  return { coupon, discountAmount };
}
