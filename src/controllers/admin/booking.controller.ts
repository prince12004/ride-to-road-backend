import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { Types } from "mongoose";
import { Booking, IBooking, IPaymentCollection } from "../../models/Booking";
import { BookingStatusHistory } from "../../models/BookingStatusHistory";
import { Car } from "../../models/Car";
import { Location } from "../../models/Location";
import { BookingStatus, PaymentStatus, PaymentMethod, BookingSource, ACTIVE_BOOKING_STATUSES } from "../../types/enums";
import { logActivity } from "../../services/activityLog.service";
import { isCarAvailable, combineDateAndTime } from "../../services/availability.service";
import { generateBookingId } from "../../utils/bookingId";
import { calculateBaseAmount, calculateDurationHours, effectiveDailyRate, snapshotRates, MIN_RENTAL_HOURS, type RateCard } from "../../services/priceCalculator.service";
import { amountReceived, balanceDue, syncPaymentStatus } from "../../services/payment.service";
import { recordCouponUsage } from "../../services/coupon.service";

export const adminListBookings = asyncHandler(async (req: Request, res: Response) => {
  const { status, paymentStatus, car, customer, dateFrom, dateTo, page = "1", limit = "20" } = req.query as Record<string, string>;

  const query: Record<string, unknown> = {};
  if (status && status !== "ALL") query.status = status;
  if (paymentStatus) query["payment.status"] = paymentStatus;
  if (car) query.car = car;
  if (customer) {
    query.$or = [
      { customerName: { $regex: customer, $options: "i" } },
      { mobile: { $regex: customer, $options: "i" } },
    ];
  }
  if (dateFrom || dateTo) {
    query.pickupAt = { ...(dateFrom ? { $gte: new Date(dateFrom) } : {}), ...(dateTo ? { $lte: new Date(dateTo) } : {}) };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate("car", "name brand model slug")
      .populate("pickupLocation", "city region")
      .sort("-createdAt")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Booking.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: bookings,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// Dedicated follow-up queue: abandoned/failed-payment bookings that never
// became a confirmed booking, so the admin team can call the customer.
export const adminListPendingPayments = asyncHandler(async (req: Request, res: Response) => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const query = {
    status: { $in: [BookingStatus.PAYMENT_PENDING, BookingStatus.PAYMENT_FAILED] },
  };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate("car", "name brand model slug")
      .populate("pickupLocation", "city region")
      .sort("-createdAt")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Booking.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: bookings,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const adminGetBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findById(req.params.id)
    .populate("car")
    .populate("pickupLocation")
    .populate("dropLocation")
    .populate("user", "name email mobile")
    .populate("coupon", "code");
  if (!booking) throw new ApiError(404, "Booking not found.");

  const history = await BookingStatusHistory.find({ booking: booking._id })
    .populate("changedByAdmin", "name")
    .sort("createdAt");

  res.json({ success: true, data: { booking, history } });
});

export const adminUpdateBookingStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, note } = req.body as { status: BookingStatus; note?: string };
  if (!Object.values(BookingStatus).includes(status)) throw new ApiError(400, "Invalid booking status.");

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");

  if ([BookingStatus.CONFIRMED, BookingStatus.CAR_ASSIGNED, BookingStatus.ACTIVE].includes(status) && status !== booking.status) {
    const available = await isCarAvailable({ carId: booking.car, pickupAt: booking.pickupAt, dropAt: booking.dropAt, excludeBookingId: booking._id });
    if (!available) throw new ApiError(409, "This car has a conflicting confirmed booking for these dates.");
  }

  booking.status = status;
  await booking.save();
  await BookingStatusHistory.create({ booking: booking._id, status, note, changedByAdmin: req.admin!.id });
  await logActivity(req, { action: "booking_status_updated", module: "bookings", recordId: String(booking._id), meta: { status } });

  res.json({ success: true, data: booking });
});

export const adminAddBookingNote = asyncHandler(async (req: Request, res: Response) => {
  const { note } = req.body as { note: string };
  const booking = await Booking.findByIdAndUpdate(req.params.id, { adminNotes: note }, { new: true });
  if (!booking) throw new ApiError(404, "Booking not found.");
  await logActivity(req, { action: "booking_note_added", module: "bookings", recordId: String(booking._id) });
  res.json({ success: true, data: booking });
});

/**
 * Rates to price an extension with: the ones frozen on the booking. Bookings
 * made before rates were stored fall back to the car's current rates, or —
 * if the car is gone — to the daily rate the customer actually paid.
 */
async function ratesForBooking(booking: IBooking): Promise<RateCard> {
  if (booking.rates?.pricePerDay) return booking.rates;
  const car = await Car.findById(booking.car);
  if (car) return snapshotRates(car);
  const days = Math.max(1, Math.ceil(booking.durationHours / 24));
  return { pricePerDay: Math.round(booking.baseAmount / days) };
}

async function quoteExtension(booking: IBooking, newDropAt: Date) {
  const rates = await ratesForBooking(booking);
  const oldHours = calculateDurationHours(booking.pickupAt, booking.dropAt);
  const newHours = calculateDurationHours(booking.pickupAt, newDropAt);
  return {
    rates,
    extraHours: Math.ceil((newDropAt.getTime() - booking.dropAt.getTime()) / (1000 * 60 * 60)),
    amount: Math.max(0, calculateBaseAmount(rates, newHours) - calculateBaseAmount(rates, oldHours)),
    fromBookingRates: Boolean(booking.rates?.pricePerDay),
  };
}

async function validateExtension(booking: IBooking | null, dropDate: string, dropTime: string) {
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ApiError(400, "Only confirmed, car-assigned or active bookings can be extended.");
  }
  const newDropAt = combineDateAndTime(dropDate, dropTime);
  if (Number.isNaN(newDropAt.getTime())) throw new ApiError(400, "Invalid drop date/time.");
  if (newDropAt <= booking.dropAt) throw new ApiError(400, "New drop date/time must be after the current drop time.");

  const available = await isCarAvailable({ carId: booking.car, pickupAt: booking.dropAt, dropAt: newDropAt, excludeBookingId: booking._id });
  if (!available) throw new ApiError(409, "This car is booked by another customer during the extended period.");
  return newDropAt;
}

// Preview shown before the admin confirms an extension.
export const adminQuoteExtension = asyncHandler(async (req: Request, res: Response) => {
  const { dropDate, dropTime } = req.body as { dropDate: string; dropTime: string };
  const booking = await Booking.findById(req.params.id);
  const newDropAt = await validateExtension(booking, dropDate, dropTime);
  const quote = await quoteExtension(booking!, newDropAt);
  res.json({
    success: true,
    data: {
      ...quote,
      dailyRate: effectiveDailyRate(quote.rates),
      newTotal: booking!.totalAmount + quote.amount,
      balanceAfter: balanceDue(booking!) + quote.amount,
    },
  });
});

// Extends the drop date/time of a live booking (customer keeping the car
// longer). Priced from the booking's original rates; the extra amount joins
// the booking total and outstanding balance (collected via payment entries).
export const adminExtendBooking = asyncHandler(async (req: Request, res: Response) => {
  const { dropDate, dropTime, amount, note } = req.body as { dropDate: string; dropTime: string; amount?: number; note?: string };

  const booking = await Booking.findById(req.params.id);
  const newDropAt = await validateExtension(booking, dropDate, dropTime);
  const b = booking!;
  const previousDropAt = b.dropAt;
  const quote = await quoteExtension(b, newDropAt);
  // An explicit amount is an admin override of the calculated charge.
  const extensionAmount = amount ?? quote.amount;

  b.dropDate = newDropAt;
  b.dropTime = dropTime;
  b.dropAt = newDropAt;
  b.durationHours = calculateDurationHours(b.pickupAt, newDropAt);
  b.extensionCharges = (b.extensionCharges ?? 0) + extensionAmount;
  b.totalAmount += extensionAmount;
  b.extensions.push({
    previousDropAt,
    newDropAt,
    extraHours: quote.extraHours,
    amount: extensionAmount,
    paymentStatus: PaymentStatus.PENDING,
    note,
    extendedBy: new Types.ObjectId(req.admin!.id),
    createdAt: new Date(),
  });
  syncPaymentStatus(b);
  await b.save();

  const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const rateText = `₹${effectiveDailyRate(quote.rates)}/day${quote.rates.pricePerHour ? `, ₹${quote.rates.pricePerHour}/hr` : ""}`;
  await BookingStatusHistory.create({
    booking: b._id,
    status: b.status,
    note:
      `Extended by ${quote.extraHours} hrs: drop ${fmt(previousDropAt)} → ${fmt(newDropAt)}. ` +
      `+₹${extensionAmount}${amount !== undefined && amount !== quote.amount ? ` (override; calculated ₹${quote.amount})` : ` at ${rateText}`}. ` +
      `Balance due ₹${balanceDue(b)}.` +
      (note ? ` — ${note}` : ""),
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, {
    action: "booking_extended",
    module: "bookings",
    recordId: String(b._id),
    meta: { previousDropAt, newDropAt, amount: extensionAmount, calculated: quote.amount },
  });

  res.json({ success: true, data: b });
});

/** Confirms a payment-pending booking once it is fully paid. */
async function confirmIfPaid(booking: IBooking): Promise<boolean> {
  const waiting = booking.status === BookingStatus.PAYMENT_PENDING || booking.status === BookingStatus.PAYMENT_FAILED;
  if (!waiting || booking.payment.status !== PaymentStatus.PAID) return false;
  const available = await isCarAvailable({ carId: booking.car, pickupAt: booking.pickupAt, dropAt: booking.dropAt, excludeBookingId: booking._id });
  if (!available) throw new ApiError(409, "This car now has another confirmed booking for these dates. Contact the customer before confirming.");
  booking.status = BookingStatus.CONFIRMED;
  return true;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// Records money received against a booking — cash, online (UPI etc.) or both
// in one go. Status follows the running total: Partially Paid until the
// booking total is covered, then Fully Paid.
export const adminCollectPayment = asyncHandler(async (req: Request, res: Response) => {
  const { cashAmount = 0, onlineAmount = 0, reference, receivedAt, note } = req.body as {
    cashAmount?: number;
    onlineAmount?: number;
    reference?: string;
    receivedAt?: string;
    note?: string;
  };

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (booking.status === BookingStatus.CANCELLED) throw new ApiError(400, "This booking is cancelled.");

  const due = balanceDue(booking);
  if (due <= 0) throw new ApiError(400, "This booking is already fully paid.");
  const total = cashAmount + onlineAmount;
  if (total > due) {
    throw new ApiError(400, `That's ${inr(total)}, but only ${inr(due)} is due on this booking. Record at most the balance.`);
  }

  const when = receivedAt ? new Date(receivedAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new ApiError(400, "Invalid payment date/time.");
  if (when.getTime() > Date.now() + 5 * 60 * 1000) throw new ApiError(400, "Payment date/time can't be in the future.");

  const adminId = new Types.ObjectId(req.admin!.id);
  const entries: IPaymentCollection[] = [];
  if (cashAmount > 0) entries.push({ mode: "CASH", amount: cashAmount, receivedAt: when, note, recordedBy: adminId, createdAt: new Date() });
  if (onlineAmount > 0) {
    entries.push({ mode: "ONLINE", amount: onlineAmount, reference: reference?.trim(), receivedAt: when, note, recordedBy: adminId, createdAt: new Date() });
  }

  const before = amountReceived(booking);
  booking.payment.collections = [...(booking.payment.collections ?? []), ...entries];
  booking.payment.amountReceived = before + total;
  if (!booking.payment.method) booking.payment.method = onlineAmount > 0 && cashAmount === 0 ? PaymentMethod.OFFLINE_UPI : PaymentMethod.OFFLINE_CASH;
  booking.payment.failureReason = undefined;
  syncPaymentStatus(booking);
  const confirmed = await confirmIfPaid(booking);
  await booking.save();
  if (booking.payment.status === PaymentStatus.PAID) await recordCouponUsage(booking);

  const parts = [cashAmount > 0 && `${inr(cashAmount)} cash`, onlineAmount > 0 && `${inr(onlineAmount)} online (UTR ${reference?.trim()})`].filter(Boolean);
  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note:
      `Payment received: ${parts.join(" + ")}. ` +
      (booking.payment.status === PaymentStatus.PAID ? "Fully paid." : `Balance due ${inr(balanceDue(booking))}.`) +
      (confirmed ? " Booking confirmed." : "") +
      (note ? ` — ${note}` : ""),
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, {
    action: "booking_payment_collected",
    module: "bookings",
    recordId: String(booking._id),
    meta: { cashAmount, onlineAmount, reference, status: booking.payment.status },
  });

  res.json({ success: true, data: booking });
});

// UPI QR: the team checked the customer's screenshot — record the balance as
// received online. (COD and part payments go through adminCollectPayment.)
export const adminVerifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { note, reference } = req.body as { note?: string; reference?: string };
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");

  const method = booking.payment.method;
  if (method !== PaymentMethod.UPI_QR && method !== PaymentMethod.COD) {
    throw new ApiError(400, "Only UPI QR and Cash on Delivery payments are verified manually.");
  }
  if (booking.payment.status === PaymentStatus.PAID) throw new ApiError(400, "This payment is already marked as paid.");
  if (booking.status === BookingStatus.CANCELLED) throw new ApiError(400, "This booking is cancelled.");
  if (method === PaymentMethod.UPI_QR && !booking.payment.proof?.url) {
    throw new ApiError(400, "The customer hasn't uploaded a payment screenshot yet.");
  }

  const due = balanceDue(booking);
  const isUpi = method === PaymentMethod.UPI_QR;
  booking.payment.collections = [
    ...(booking.payment.collections ?? []),
    {
      mode: isUpi ? "ONLINE" : "CASH",
      amount: due,
      reference: isUpi ? reference?.trim() || "UPI QR — screenshot verified" : undefined,
      receivedAt: new Date(),
      note,
      recordedBy: new Types.ObjectId(req.admin!.id),
      createdAt: new Date(),
    },
  ];
  booking.payment.amountReceived = amountReceived(booking) + due;
  booking.payment.failureReason = undefined;
  booking.payment.reviewNote = note;
  booking.payment.reviewedAt = new Date();
  syncPaymentStatus(booking);
  const confirming = await confirmIfPaid(booking);
  await booking.save();

  await recordCouponUsage(booking);
  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note:
      (isUpi ? "UPI payment verified." : "Cash payment received.") +
      (confirming ? " Booking confirmed." : "") +
      (note ? ` — ${note}` : ""),
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, { action: "booking_payment_verified", module: "bookings", recordId: String(booking._id), meta: { method } });

  res.json({ success: true, data: booking });
});

export const adminRejectPayment = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body as { reason: string };
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (booking.payment.method !== PaymentMethod.UPI_QR) throw new ApiError(400, "Only UPI QR payments can be rejected.");
  if (booking.payment.status === PaymentStatus.PAID) throw new ApiError(400, "This payment is already verified.");

  booking.payment.status = PaymentStatus.FAILED;
  booking.payment.failureReason = reason;
  booking.payment.reviewNote = reason;
  booking.payment.reviewedAt = new Date();
  if (booking.status === BookingStatus.PAYMENT_PENDING) booking.status = BookingStatus.PAYMENT_FAILED;
  await booking.save();

  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note: `Payment screenshot rejected — ${reason}`,
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, { action: "booking_payment_rejected", module: "bookings", recordId: String(booking._id) });

  res.json({ success: true, data: booking });
});

export const adminCancelBooking = asyncHandler(async (req: Request, res: Response) => {
  const { note } = req.body as { note?: string };
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");

  booking.status = BookingStatus.CANCELLED;
  await booking.save();
  await BookingStatusHistory.create({ booking: booking._id, status: BookingStatus.CANCELLED, note: note ?? "Cancelled by admin.", changedByAdmin: req.admin!.id });
  await logActivity(req, { action: "booking_cancelled", module: "bookings", recordId: String(booking._id) });

  res.json({ success: true, data: booking });
});

// Manual/offline booking: phone call, WhatsApp enquiry, walk-in, etc. Created
// already CONFIRMED with the payment recorded as whatever the admin entered.
export const adminCreateOfflineBooking = asyncHandler(async (req: Request, res: Response) => {
  const {
    carId, customerName, mobile, email, pickupLocationId, dropLocationId,
    pickupDate, pickupTime, dropDate, dropTime, totalAmount, paymentMethod, adminNotes,
  } = req.body;

  const car = await Car.findById(carId);
  if (!car) throw new ApiError(404, "Selected car was not found.");

  const [pickupLocation, dropLocation] = await Promise.all([Location.findById(pickupLocationId), Location.findById(dropLocationId)]);
  if (!pickupLocation) throw new ApiError(404, "Selected pickup location was not found.");
  if (!dropLocation) throw new ApiError(404, "Selected drop location was not found.");

  const pickupAt = combineDateAndTime(pickupDate, pickupTime);
  const dropAt = combineDateAndTime(dropDate, dropTime);
  if (dropAt <= pickupAt) throw new ApiError(400, "Drop date/time must be after pickup date/time.");
  if (dropAt.getTime() - pickupAt.getTime() < MIN_RENTAL_HOURS * 60 * 60 * 1000) {
    throw new ApiError(400, `Minimum rental duration is ${MIN_RENTAL_HOURS} hours.`);
  }

  const available = await isCarAvailable({ carId: car._id, pickupAt, dropAt });
  if (!available) throw new ApiError(409, "This car is already booked for the selected dates.");

  const durationHours = Math.max(1, Math.ceil((dropAt.getTime() - pickupAt.getTime()) / (1000 * 60 * 60)));
  const bookingId = await generateBookingId();

  const booking = await Booking.create({
    bookingId,
    car: car._id,
    customerName,
    mobile,
    email: email || undefined,
    pickupLocation: pickupLocation._id,
    dropLocation: dropLocation._id,
    pickupDate: pickupAt,
    pickupTime,
    dropDate: dropAt,
    dropTime,
    pickupAt,
    dropAt,
    durationHours,
    baseAmount: totalAmount,
    totalAmount,
    rates: snapshotRates(car),
    status: BookingStatus.CONFIRMED,
    source: BookingSource.ADMIN_OFFLINE,
    adminNotes,
    payment: {
      status: PaymentStatus.PAID,
      method: paymentMethod,
      amount: totalAmount,
      amountReceived: totalAmount,
      paidAt: new Date(),
      collections: [
        {
          mode: paymentMethod === PaymentMethod.OFFLINE_CASH ? "CASH" : "ONLINE",
          amount: totalAmount,
          receivedAt: new Date(),
          note: "Recorded when the offline booking was created.",
          recordedBy: new Types.ObjectId(req.admin!.id),
          createdAt: new Date(),
        },
      ],
    },
  });

  await BookingStatusHistory.create({
    booking: booking._id,
    status: BookingStatus.CONFIRMED,
    note: "Created as an offline booking by admin.",
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, { action: "offline_booking_created", module: "bookings", recordId: String(booking._id) });

  res.status(201).json({ success: true, data: booking });
});
