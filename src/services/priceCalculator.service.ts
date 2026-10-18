import { ICar } from "../models/Car";
import { ICoupon } from "../models/Coupon";
import { DiscountType } from "../types/enums";

export interface PriceBreakdown {
  durationHours: number;
  baseAmount: number;
  additionalCharges: number;
  taxAmount: number;
  discountAmount: number;
  /** Refundable deposit, collected with the booking. Never taxed or discounted. */
  securityDeposit: number;
  totalAmount: number;
}

export function calculateDurationHours(pickupAt: Date, dropAt: Date): number {
  const ms = dropAt.getTime() - pickupAt.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
}

/** Self-drive bookings are always at least one full day. */
export const MIN_RENTAL_HOURS = 24;

export type RateCard = Pick<ICar, "pricePerDay" | "pricePerHour" | "weeklyPrice" | "monthlyPrice">;

/** Daily rate: hourly × 24 when an hourly price is set, else the stored daily price. */
export function effectiveDailyRate(rates: Pick<ICar, "pricePerDay" | "pricePerHour">): number {
  return rates.pricePerHour ? Math.round(rates.pricePerHour * 24) : rates.pricePerDay;
}

/** The rates to freeze on a booking, so later extensions use the agreed price. */
export function snapshotRates(car: RateCard): RateCard {
  return {
    pricePerHour: car.pricePerHour || undefined,
    pricePerDay: effectiveDailyRate(car),
    weeklyPrice: car.weeklyPrice || undefined,
    monthlyPrice: car.monthlyPrice || undefined,
  };
}

/**
 * Rental for a duration: whole months at the monthly price, then whole weeks
 * at the weekly price (both optional), then whole days at the daily rate. A
 * leftover part-day costs hours × hourly price (never more than a day), or a
 * full day when the car has no hourly price.
 */
export function calculateBaseAmount(car: RateCard, durationHours: number): number {
  const daily = effectiveDailyRate(car);
  let hours = Math.max(0, Math.ceil(durationHours));
  let total = 0;

  if (car.monthlyPrice && hours >= 30 * 24) {
    total += Math.floor(hours / (30 * 24)) * car.monthlyPrice;
    hours %= 30 * 24;
  }
  if (car.weeklyPrice && hours >= 7 * 24) {
    total += Math.floor(hours / (7 * 24)) * car.weeklyPrice;
    hours %= 7 * 24;
  }
  total += Math.floor(hours / 24) * daily;
  const leftover = hours % 24;
  if (leftover > 0) total += car.pricePerHour ? Math.min(leftover * car.pricePerHour, daily) : daily;

  return Math.round(total);
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
  const securityDeposit = Math.max(0, Math.round(car.securityDeposit ?? 0));
  const totalAmount = taxableAmount + taxAmount + securityDeposit;

  return { durationHours, baseAmount, additionalCharges, taxAmount, discountAmount, securityDeposit, totalAmount };
}
