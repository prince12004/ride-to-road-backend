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
  deliveryAddress: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["COD", "UPI_QR"], { errorMap: () => ({ message: "Choose a payment method" }) }),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "Please accept the Terms & Conditions" }) }),
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

export const extendQuoteSchema = z.object({
  dropDate: z.string().min(1, "New drop date is required"),
  dropTime: z.string().min(1, "New drop time is required"),
});

export const extendBookingSchema = extendQuoteSchema.extend({
  // Omitted → calculated from the booking's original rates.
  amount: z.number().nonnegative().optional(),
  note: z.string().max(1000).optional(),
});

export const reviewPaymentSchema = z.object({
  note: z.string().max(500).optional(),
  reference: z.string().trim().max(60).optional(),
});

export const rejectPaymentSchema = z.object({
  reason: z.string().min(3, "Tell the customer why the payment was rejected").max(500),
});

const money = z.number({ invalid_type_error: "Enter an amount" }).int("Use whole rupees").nonnegative().max(10_000_000);

export const collectPaymentSchema = z
  .object({
    cashAmount: money.optional(),
    onlineAmount: money.optional(),
    onlineMethod: z.enum(["UPI", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
    reference: z.string().trim().max(60).optional(),
    receivedAt: z.string().optional(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => (v.cashAmount ?? 0) + (v.onlineAmount ?? 0) > 0, {
    message: "Enter the cash and/or online amount received",
    path: ["cashAmount"],
  })
  .refine((v) => !(v.onlineAmount && v.onlineAmount > 0) || /^[A-Za-z0-9-]{4,60}$/.test(v.reference ?? ""), {
    message: "Enter the UTR / transaction ID for the online payment",
    path: ["reference"],
  });

const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const editBookingSchema = z
  .object({
    customerName: z.string().trim().min(2, "Enter the customer's name").max(80).optional(),
    mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").optional(),
    email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
    address: z.string().max(500).optional(),
    specialRequest: z.string().max(1000).optional(),
    pickupLocationId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid location").optional(),
    deliveryAddress: z.string().max(500).optional(),
    pickupDate: dateStr.optional(),
    pickupTime: timeStr.optional(),
    dropDate: dateStr.optional(),
    dropTime: timeStr.optional(),
  })
  .refine(
    (v) => {
      const n = [v.pickupDate, v.pickupTime, v.dropDate, v.dropTime].filter(Boolean).length;
      return n === 0 || n === 4;
    },
    { message: "Give pickup and return date and time together", path: ["dropDate"] },
  );

const km = z.number({ invalid_type_error: "Enter a number" }).nonnegative().max(1_000_000);

export const closeBookingSchema = z
  .object({
    closedAt: z.string().optional(),
    odometerStart: km.optional(),
    odometerEnd: km.optional(),
    kmDriven: km.optional(),
    otherCharges: money.optional(),
    otherChargesNote: z.string().max(300).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.kmDriven !== undefined || (v.odometerStart !== undefined && v.odometerEnd !== undefined), {
    message: "Enter the km driven or both odometer readings",
    path: ["kmDriven"],
  })
  .refine((v) => v.odometerStart === undefined || v.odometerEnd === undefined || v.odometerEnd >= v.odometerStart, {
    message: "End reading can't be less than the start reading",
    path: ["odometerEnd"],
  });

export const deleteBookingSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for deleting this booking").max(500),
});
