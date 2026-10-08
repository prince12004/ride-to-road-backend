import { ICar } from "../models/Car";
import { ICoupon } from "../models/Coupon";
import { DiscountType } from "../types/enums";

export interface PriceBreakdown {
  durationHours: number;
  baseAmount: number;
  additionalCharges: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
}

export function calculateDurationHours(pickupAt: Date, dropAt: Date): number {
  const ms = dropAt.getTime() - pickupAt.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
}

/** Cheapest applicable combination of monthly -> weekly -> daily pricing tiers. */
export function calculateBaseAmount(
  car: Pick<ICar, "pricePerDay" | "weeklyPrice" | "monthlyPrice" | "pricePerHour">,
  durationHours: number
): number {
  const { pricePerDay, weeklyPrice, monthlyPrice, pricePerHour } = car;

  // Cars with an hourly rate are billed by the hour (short self-drive rentals),
  // rather than rounding up to whole days.
  if (pricePerHour) {
    return Math.round(pricePerHour * durationHours);
  }

  if (monthlyPrice && durationHours >= 30 * 24) {
    const months = Math.floor(durationHours / (30 * 24));
    const remaining = durationHours % (30 * 24);
    return months * monthlyPrice + calculateBaseAmount({ pricePerDay, weeklyPrice }, remaining || 0);
  }
  if (weeklyPrice && durationHours >= 7 * 24) {
    const weeks = Math.floor(durationHours / (7 * 24));
    const remaining = durationHours % (7 * 24);
    return weeks * weeklyPrice + calculateBaseAmount({ pricePerDay }, remaining || 0);
  }

  const days = Math.max(1, Math.ceil(durationHours / 24));
  return days * pricePerDay;
}

export function calculateCouponDiscount(
  coupon: Pick<ICoupon, "discountType" | "percentage" | "fixedAmount" | "maxDiscount" | "minBookingAmount">,
  baseAmount: number
): number {
  if (coupon.minBookingAmount && baseAmount < coupon.minBookingAmount) return 0;

  let discount = 0;
  if (coupon.discountType === DiscountType.PERCENTAGE && coupon.percentage) {
    discount = (baseAmount * coupon.percentage) / 100;
  } else if (coupon.discountType === DiscountType.FIXED && coupon.fixedAmount) {
    discount = coupon.fixedAmount;
  }
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return Math.round(Math.min(discount, baseAmount));
}

export function buildPriceBreakdown({
  car,
  pickupAt,
  dropAt,
  additionalCharges = 0,
  taxPercent = 0,
  coupon,
}: {
  car: Pick<ICar, "pricePerDay" | "pricePerHour" | "weeklyPrice" | "monthlyPrice" | "securityDeposit">;
  pickupAt: Date;
  dropAt: Date;
  additionalCharges?: number;
  taxPercent?: number;
  coupon?: Pick<ICoupon, "discountType" | "percentage" | "fixedAmount" | "maxDiscount" | "minBookingAmount"> | null;
}): PriceBreakdown {
  const durationHours = calculateDurationHours(pickupAt, dropAt);
  const baseAmount = calculateBaseAmount(car, durationHours);
  const discountAmount = coupon ? calculateCouponDiscount(coupon, baseAmount) : 0;
  const taxableAmount = Math.max(0, baseAmount + additionalCharges - discountAmount);
  const taxAmount = Math.round((taxableAmount * taxPercent) / 100);
  const totalAmount = taxableAmount + taxAmount;

  return { durationHours, baseAmount, additionalCharges, taxAmount, discountAmount, totalAmount };
}
