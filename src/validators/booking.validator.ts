import { z } from "zod";

export const initiateBookingSchema = z.object({
  carId: z.string().min(1, "Car is required"),
  customerName: z.string().min(2, "Name is too short"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  pickupLocationId: z.string().min(1, "Pickup location is required"),
  dropLocationId: z.string().min(1, "Drop location is required"),
  pickupDate: z.string().min(1),
  pickupTime: z.string().min(1),
  dropDate: z.string().min(1),
  dropTime: z.string().min(1),
  specialRequest: z.string().max(1000).optional(),
  couponCode: z.string().optional(),
  homeDelivery: z.boolean().optional(),
});

export const verifyPaymentSchema = z.object({
  bookingId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const paymentFailedSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().optional(),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1),
  carId: z.string().min(1),
  baseAmount: z.number().nonnegative(),
  mobile: z.string().optional(),
});

export const offlineBookingSchema = z.object({
  carId: z.string().min(1),
  customerName: z.string().min(2),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email().optional().or(z.literal("")),
  pickupLocationId: z.string().min(1),
  dropLocationId: z.string().min(1),
  pickupDate: z.string().min(1),
  pickupTime: z.string().min(1),
  dropDate: z.string().min(1),
  dropTime: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  paymentMethod: z.enum(["OFFLINE_CASH", "OFFLINE_UPI", "OFFLINE_OTHER"]),
  adminNotes: z.string().optional(),
});

export const extendBookingSchema = z
  .object({
    dropDate: z.string().min(1, "New drop date is required"),
    dropTime: z.string().min(1, "New drop time is required"),
    // Omitted → calculated from the car's pricing for the extra duration.
    amount: z.number().nonnegative().optional(),
    paymentStatus: z.enum(["PAID", "PENDING"]),
    paymentMethod: z.enum(["OFFLINE_CASH", "OFFLINE_UPI", "OFFLINE_OTHER"]).optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((v) => v.paymentStatus !== "PAID" || !!v.paymentMethod, {
    message: "Select how the extension was paid",
    path: ["paymentMethod"],
  });
