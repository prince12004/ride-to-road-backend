import { Request, Response } from "express";
import { bookingSummary } from "../services/bookingSummary.service";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Car } from "../models/Car";
import { Location } from "../models/Location";
import { Booking } from "../models/Booking";
import { BookingStatusHistory } from "../models/BookingStatusHistory";
import { Setting } from "../models/Setting";
import { CarStatus, BookingStatus, PaymentStatus, PaymentMethod, BookingSource } from "../types/enums";
import { combineDateAndTime, isCarAvailable, isCarOfferedIn } from "../services/availability.service";
import { buildPriceBreakdown, snapshotRates, MIN_RENTAL_HOURS, DEFAULT_KM_PER_DAY } from "../services/priceCalculator.service";
import { validateCouponForBooking, recordCouponUsage } from "../services/coupon.service";
import { generateBookingId } from "../utils/bookingId";
import { verifyRazorpaySignature } from "../services/razorpay.service";
import { validateDocumentFile, uploadPrivateFile } from "../services/upload.service";

function maskAddress(address: string): string {
  const visible = address.slice(0, Math.min(12, Math.ceil(address.length / 3)));
  return `${visible}… (full address visible when logged in)`;
}

export const initiateBooking = asyncHandler(async (req: Request, res: Response) => {
  const {
    carId, customerName, mobile, email, address,
    pickupLocationId, dropLocationId, pickupDate, pickupTime, dropDate, dropTime,
    specialRequest, couponCode, homeDelivery, deliveryAddress, paymentMethod,
  } = req.body as Record<string, any> & { paymentMethod: "COD" | "UPI_QR" };

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

  if (!isCarOfferedIn(car, pickupLocation)) {
    throw new ApiError(400, `${car.name} isn't available in ${pickupLocation.city}. Please choose another city or car.`);
  }

  const settings = await Setting.findOne({ key: "GLOBAL" });
  // Self-drive rentals are never shorter than a day; the admin setting can only raise this.
  const minHours = Math.max(MIN_RENTAL_HOURS, settings?.booking?.minRentalHours ?? 0);
  const durationCheckHours = (dropAt.getTime() - pickupAt.getTime()) / (1000 * 60 * 60);
  if (durationCheckHours < minHours) throw new ApiError(400, `Minimum rental duration is ${minHours} hours.`);

  const available = await isCarAvailable({ carId: car._id, pickupAt, dropAt });
  if (!available) throw new ApiError(409, "This car is already booked for the selected dates. Please choose different dates.");

  const deliveryRequested = Boolean(homeDelivery) && Boolean(car.homeDelivery?.available);
  const deliveryFee = deliveryRequested ? car.homeDelivery.price : 0;
  const deliveryAddr = typeof deliveryAddress === "string" ? deliveryAddress.trim() : "";
  if (deliveryRequested && deliveryAddr.length < 10) {
    throw new ApiError(400, "Please enter the complete delivery address (house no., street, area, city).");
  }

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
  const isCod = paymentMethod === "COD";

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
    securityDeposit: pricing.securityDeposit,
    totalAmount: pricing.totalAmount,
    rates: snapshotRates(car),
    kmPolicy: { kmPerDay: settings?.booking?.kmPerDay ?? DEFAULT_KM_PER_DAY, extraKmRate: car.extraKmRate ?? 0 },
    termsAcceptedAt: new Date(),
    homeDelivery: { requested: deliveryRequested, fee: deliveryFee, address: deliveryRequested ? deliveryAddr : undefined },
    specialRequest,
    // COD confirms the booking right away (paid in cash at pickup). UPI QR
    // stays payment-pending until an admin checks the uploaded screenshot.
    status: isCod ? BookingStatus.CONFIRMED : BookingStatus.PAYMENT_PENDING,
    source: BookingSource.ONLINE,
    payment: {
      status: PaymentStatus.PENDING,
      method: isCod ? PaymentMethod.COD : PaymentMethod.UPI_QR,
      amount: pricing.totalAmount,
      amountReceived: 0,
    },
  });

  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note: isCod
      ? "Booking confirmed — Cash on Delivery, to be paid at pickup."
      : "Booking created — awaiting UPI payment screenshot.",
  });

  if (isCod) await recordCouponUsage(booking);

  res.status(201).json({ success: true, data: { booking } });
});

// Customer uploads the screenshot of their UPI QR payment. The booking stays
// payment-pending until an admin verifies it from the admin panel.
export const uploadPaymentProof = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ bookingId: req.params.bookingId, user: req.user!.id });
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (booking.payment.method !== PaymentMethod.UPI_QR) throw new ApiError(400, "This booking is not paid by UPI QR.");
  if (booking.payment.status === PaymentStatus.PAID) throw new ApiError(400, "Payment for this booking is already verified.");
  if (booking.status === BookingStatus.CANCELLED) throw new ApiError(400, "This booking has been cancelled.");

  const file = req.file;
  if (!file) throw new ApiError(400, "Please choose your payment screenshot.");
  const kind = validateDocumentFile(file, { allowPdf: false });
  const uploaded = await uploadPrivateFile(file.buffer, "payment-proofs", kind);

  booking.payment.proof = { url: uploaded.url, publicId: uploaded.publicId, uploadedAt: new Date() };
  booking.payment.status = PaymentStatus.PENDING;
  booking.payment.failureReason = undefined;
  if (booking.status === BookingStatus.PAYMENT_FAILED) booking.status = BookingStatus.PAYMENT_PENDING;
  await booking.save();

  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note: "Payment screenshot uploaded — awaiting verification.",
  });

  res.json({ success: true, message: "Screenshot received. We'll verify your payment shortly.", data: { booking } });
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

  await recordCouponUsage(booking);

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

  // This endpoint is reachable by anyone holding the booking id, so never
  // expose the payment screenshot link — only whether one was uploaded.
  const data = booking.toObject();
  if (data.payment?.proof?.url) {
    data.payment.proof = { uploadedAt: data.payment.proof.uploadedAt } as typeof data.payment.proof;
  }
  delete (data.payment as { razorpaySignature?: string }).razorpaySignature;
  // Booking ids are sequential, so this public view only hints at the
  // address; the owner sees it in full via /bookings/me/:id.
  if (data.homeDelivery?.address) {
    data.homeDelivery.address = maskAddress(data.homeDelivery.address);
  }
  // Admin-side payment entries (who recorded them, internal notes) stay private.
  if (data.payment?.collections) {
    data.payment.collections = data.payment.collections.map(({ mode, method, amount, receivedAt }) => ({ mode, method, amount, receivedAt })) as typeof data.payment.collections;
  }
  if (data.closure) {
    delete data.closure.notes;
    delete data.closure.closedBy;
  }

  res.json({ success: true, data: { booking: data, history, summary: await bookingSummary(booking) } });
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
  res.json({ success: true, data: { booking, history, summary: await bookingSummary(booking) } });
});
