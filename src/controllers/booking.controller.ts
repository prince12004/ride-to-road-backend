import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Car } from "../models/Car";
import { Location } from "../models/Location";
import { Booking } from "../models/Booking";
import { BookingStatusHistory } from "../models/BookingStatusHistory";
import { CouponUsage } from "../models/CouponUsage";
import { Coupon } from "../models/Coupon";
import { Setting } from "../models/Setting";
import { CarStatus, BookingStatus, PaymentStatus, PaymentMethod, BookingSource } from "../types/enums";
import { combineDateAndTime, isCarAvailable } from "../services/availability.service";
import { buildPriceBreakdown } from "../services/priceCalculator.service";
import { validateCouponForBooking } from "../services/coupon.service";
import { generateBookingId } from "../utils/bookingId";
import { createRazorpayOrder, verifyRazorpaySignature, isRazorpayConfigured } from "../services/razorpay.service";
import { env } from "../config/env";

export const initiateBooking = asyncHandler(async (req: Request, res: Response) => {
  const {
    carId, customerName, mobile, email, address,
    pickupLocationId, dropLocationId, pickupDate, pickupTime, dropDate, dropTime,
    specialRequest, couponCode, homeDelivery,
  } = req.body;

  const car = await Car.findById(carId);
  if (!car) throw new ApiError(404, "Selected car was not found.");
  if (car.status === CarStatus.INACTIVE || car.status === CarStatus.MAINTENANCE) {
    throw new ApiError(400, "This car is currently not available for booking.");
  }

  const [pickupLocation, dropLocation] = await Promise.all([
    Location.findById(pickupLocationId),
    Location.findById(dropLocationId),
  ]);
  if (!pickupLocation) throw new ApiError(404, "Selected pickup location was not found.");
  if (!dropLocation) throw new ApiError(404, "Selected drop location was not found.");

  const pickupAt = combineDateAndTime(pickupDate, pickupTime);
  const dropAt = combineDateAndTime(dropDate, dropTime);

  if (pickupAt.getTime() < Date.now() - 60 * 60 * 1000) throw new ApiError(400, "Pickup date/time cannot be in the past.");
  if (dropAt <= pickupAt) throw new ApiError(400, "Drop date/time must be after pickup date/time.");

  const settings = await Setting.findOne({ key: "GLOBAL" });
  const minHours = settings?.booking?.minRentalHours ?? 4;
  const durationCheckHours = (dropAt.getTime() - pickupAt.getTime()) / (1000 * 60 * 60);
  if (durationCheckHours < minHours) throw new ApiError(400, `Minimum rental duration is ${minHours} hours.`);

  const available = await isCarAvailable({ carId: car._id, pickupAt, dropAt });
  if (!available) throw new ApiError(409, "This car is already booked for the selected dates. Please choose different dates.");

  const deliveryRequested = Boolean(homeDelivery) && Boolean(car.homeDelivery?.available);
  const deliveryFee = deliveryRequested ? car.homeDelivery.price : 0;

  let appliedCoupon = null;
  const draftPricing = buildPriceBreakdown({
    car,
    pickupAt,
    dropAt,
    additionalCharges: deliveryFee,
    taxPercent: settings?.booking?.taxPercent ?? 0,
    coupon: null,
  });

  if (couponCode) {
    const result = await validateCouponForBooking({ code: couponCode, carId: car._id, baseAmount: draftPricing.baseAmount, mobile });
    appliedCoupon = result.coupon;
  }

  const pricing = buildPriceBreakdown({
    car,
    pickupAt,
    dropAt,
    additionalCharges: deliveryFee,
    taxPercent: settings?.booking?.taxPercent ?? 0,
    coupon: appliedCoupon,
  });

  const bookingId = await generateBookingId();

  const booking = await Booking.create({
    bookingId,
    user: req.user?.id,
    car: car._id,
    customerName,
    mobile,
    email: email || undefined,
    address,
    pickupLocation: pickupLocation._id,
    dropLocation: dropLocation._id,
    pickupDate: pickupAt,
    pickupTime,
    dropDate: dropAt,
    dropTime,
    pickupAt,
    dropAt,
    durationHours: pricing.durationHours,
    coupon: appliedCoupon?._id,
    baseAmount: pricing.baseAmount,
    additionalCharges: pricing.additionalCharges,
    taxAmount: pricing.taxAmount,
    discountAmount: pricing.discountAmount,
    totalAmount: pricing.totalAmount,
    homeDelivery: { requested: deliveryRequested, fee: deliveryFee },
    specialRequest,
    status: BookingStatus.PAYMENT_PENDING,
    source: BookingSource.ONLINE,
    payment: { status: PaymentStatus.PENDING },
  });

  await BookingStatusHistory.create({
    booking: booking._id,
    status: BookingStatus.PAYMENT_PENDING,
    note: "Booking created, awaiting payment.",
  });

  if (!isRazorpayConfigured()) {
    return res.status(201).json({
      success: true,
      data: { booking, razorpayConfigured: false },
      message: "Booking saved. Online payment is not configured yet — our team will contact you to confirm.",
    });
  }

  const order = await createRazorpayOrder({
    amountInRupees: pricing.totalAmount,
    receipt: bookingId,
    notes: { bookingId, carName: car.name },
  });

  booking.payment.razorpayOrderId = order.orderId;
  await booking.save();

  res.status(201).json({
    success: true,
    data: {
      booking,
      razorpayConfigured: true,
      razorpayOrder: { orderId: order.orderId, amount: order.amount, currency: order.currency, keyId: env.razorpay.keyId },
    },
  });
});

export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const booking = await Booking.findOne({ bookingId });
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (booking.payment.razorpayOrderId !== razorpay_order_id) throw new ApiError(400, "Order mismatch.");

  const isValid = verifyRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!isValid) {
    booking.payment.status = PaymentStatus.FAILED;
    booking.payment.failureReason = "Signature verification failed.";
    booking.status = BookingStatus.PAYMENT_FAILED;
    await booking.save();
    await BookingStatusHistory.create({ booking: booking._id, status: BookingStatus.PAYMENT_FAILED, note: "Payment signature verification failed." });
    throw new ApiError(400, "Payment verification failed.");
  }

  booking.payment.status = PaymentStatus.PAID;
  booking.payment.method = PaymentMethod.RAZORPAY;
  booking.payment.razorpayPaymentId = razorpay_payment_id;
  booking.payment.razorpaySignature = razorpay_signature;
  booking.payment.amount = booking.totalAmount;
  booking.payment.paidAt = new Date();
  booking.status = BookingStatus.CONFIRMED;
  await booking.save();

  await BookingStatusHistory.create({ booking: booking._id, status: BookingStatus.CONFIRMED, note: "Payment successful. Booking confirmed." });

  if (booking.coupon) {
    await Promise.all([
      Coupon.findByIdAndUpdate(booking.coupon, { $inc: { usedCount: 1 } }),
      CouponUsage.create({ coupon: booking.coupon, mobile: booking.mobile, booking: booking._id, discountApplied: booking.discountAmount }),
    ]);
  }

  res.json({ success: true, data: { booking } });
});

export const markPaymentFailed = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, reason } = req.body;
  const booking = await Booking.findOne({ bookingId });
  if (!booking) throw new ApiError(404, "Booking not found.");

  if (booking.status === BookingStatus.CONFIRMED) {
    return res.json({ success: true, data: { booking } }); // already paid, ignore late failure callback
  }

  booking.payment.status = PaymentStatus.FAILED;
  booking.payment.failureReason = reason || "Payment was not completed.";
  booking.status = BookingStatus.PAYMENT_FAILED;
  await booking.save();

  await BookingStatusHistory.create({ booking: booking._id, status: BookingStatus.PAYMENT_FAILED, note: reason || "Payment was not completed." });
  res.json({ success: true, data: { booking } });
});

export const getBookingByBookingId = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ bookingId: req.params.bookingId })
    .populate("car", "name brand model slug mainImage pricePerDay")
    .populate("pickupLocation", "city region")
    .populate("dropLocation", "city region");
  if (!booking) throw new ApiError(404, "Booking not found.");

  const history = await BookingStatusHistory.find({ booking: booking._id }).sort("createdAt");
  res.json({ success: true, data: { booking, history } });
});

export const listMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const query: Record<string, unknown> = { user: req.user!.id };
  if (status && status !== "ALL") query.status = status;

  const bookings = await Booking.find(query)
    .populate("car", "name brand model slug mainImage pricePerDay")
    .populate("pickupLocation", "city region")
    .sort("-createdAt");

  res.json({ success: true, data: bookings });
});

export const getMyBookingById = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user!.id })
    .populate("car")
    .populate("pickupLocation")
    .populate("dropLocation");
  if (!booking) throw new ApiError(404, "Booking not found.");

  const history = await BookingStatusHistory.find({ booking: booking._id }).sort("createdAt");
  res.json({ success: true, data: { booking, history } });
});
