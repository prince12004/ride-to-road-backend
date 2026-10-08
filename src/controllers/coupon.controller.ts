import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { Car } from "../models/Car";
import { ApiError } from "../utils/ApiError";
import { validateCouponForBooking } from "../services/coupon.service";

export const validateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { code, carId, baseAmount, mobile } = req.body as { code: string; carId: string; baseAmount: number; mobile?: string };

  const car = await Car.findById(carId);
  if (!car) throw new ApiError(404, "Car not found.");

  const { discountAmount, coupon } = await validateCouponForBooking({ code, carId: car._id, baseAmount, mobile });

  res.json({
    success: true,
    data: { code: coupon.code, discountAmount, estimatedAmount: Math.max(0, baseAmount - discountAmount) },
  });
});
