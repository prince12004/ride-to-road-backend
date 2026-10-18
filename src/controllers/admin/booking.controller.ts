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
import { calculateBaseAmount, calculateDurationHours, effectiveDailyRate, snapshotRates, MIN_RENTAL_HOURS, DEFAULT_KM_PER_DAY, includedKm, extraKmCharge, type RateCard } from "../../services/priceCalculator.service";
import { Setting } from "../../models/Setting";
import { User, type IUser } from "../../models/User";
import { viewableDocumentUrl } from "../../services/upload.service";
import { bookingSummary } from "../../services/bookingSummary.service";
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

/**
 * The customer's profile and KYC documents for a booking: the linked account,
 * or — for offline bookings made without one — the account registered with
 * the same mobile number (mobile is the login identity, so it is unique).
 */
async function customerForBooking(booking: IBooking) {
  const fields = "name email mobile address city state pincode profileImage verification";
  let matchedBy: "account" | "mobile" | null = null;
  let user = booking.user ? await User.findById(booking.user).select<IUser>(fields) : null;
  if (user) matchedBy = "account";
  else {
    user = await User.findOne({ mobile: booking.mobile }).select<IUser>(fields);
    if (user) matchedBy = "mobile";
  }
  if (!user) return null;
  return {
    matchedBy,
    _id: String(user._id),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    address: user.address,
    city: user.city,
    state: user.state,
    pincode: user.pincode,
    profileImage: user.profileImage?.url ? { url: user.profileImage.url } : undefined,
    verificationStatus: user.verification?.status,
    documents: (user.verification?.documents ?? []).map((d) => ({
      type: d.type,
      url: viewableDocumentUrl(d),
      isPdf: d.publicId?.endsWith(".pdf") ?? false,
    })),
  };
}

export const adminGetBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findById(req.params.id)
    .populate("car")
    .populate("pickupLocation")
    .populate("dropLocation")
    .populate("user", "name email mobile")
    .populate("coupon", "code")
    .populate("payment.collections.recordedBy", "name")
    .populate("closure.closedBy", "name");
  if (!booking) throw new ApiError(404, "Booking not found.");

  const [history, summary, customer] = await Promise.all([
    BookingStatusHistory.find({ booking: booking._id }).populate("changedByAdmin", "name").sort("createdAt"),
    bookingSummary(booking),
    customerForBooking(booking),
  ]);

  res.json({ success: true, data: { booking, history, summary, customer } });
});

const TERMINAL_STATUSES = [BookingStatus.COMPLETED, BookingStatus.CANCELLED];

// Edits customer / trip details. A schedule change re-prices the rental from
// the booking's own rates (not the car's current price) and re-checks
// availability; every change is written to the booking history.
export const adminEditBooking = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    customerName?: string;
    mobile?: string;
    email?: string;
    address?: string;
    specialRequest?: string;
    pickupLocationId?: string;
    deliveryAddress?: string;
    pickupDate?: string;
    pickupTime?: string;
    dropDate?: string;
    dropTime?: string;
  };
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (TERMINAL_STATUSES.includes(booking.status)) throw new ApiError(400, "Completed or cancelled bookings can't be edited.");

  const changes: string[] = [];
  const setText = (key: "customerName" | "mobile" | "email" | "address" | "specialRequest", label: string) => {
    const v = body[key];
    if (v === undefined) return;
    const next = v.trim() || undefined;
    if ((booking[key] ?? undefined) !== next) {
      changes.push(`${label}: ${booking[key] ?? "—"} → ${next ?? "—"}`);
      (booking as unknown as Record<string, unknown>)[key] = next;
    }
  };
  setText("customerName", "Name");
  setText("mobile", "Mobile");
  setText("email", "Email");
  setText("address", "Address");
  setText("specialRequest", "Special request");

  if (body.pickupLocationId && body.pickupLocationId !== String(booking.pickupLocation)) {
    const loc = await Location.findById(body.pickupLocationId);
    if (!loc) throw new ApiError(404, "Selected location was not found.");
    booking.pickupLocation = loc._id;
    booking.dropLocation = loc._id;
    changes.push(`Pickup location → ${loc.city}`);
  }
  if (body.deliveryAddress !== undefined && booking.homeDelivery?.requested) {
    const addr = body.deliveryAddress.trim();
    if (addr.length < 10) throw new ApiError(400, "Enter the complete delivery address.");
    if (addr !== booking.homeDelivery.address) {
      booking.homeDelivery.address = addr;
      changes.push("Delivery address updated");
    }
  }

  const scheduleGiven = body.pickupDate && body.pickupTime && body.dropDate && body.dropTime;
  if (scheduleGiven) {
    const pickupAt = combineDateAndTime(body.pickupDate!, body.pickupTime!);
    const dropAt = combineDateAndTime(body.dropDate!, body.dropTime!);
    if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(dropAt.getTime())) throw new ApiError(400, "Invalid date/time.");
    if (pickupAt.getTime() !== booking.pickupAt.getTime() || dropAt.getTime() !== booking.dropAt.getTime()) {
      if (dropAt.getTime() - pickupAt.getTime() < MIN_RENTAL_HOURS * 60 * 60 * 1000) {
        throw new ApiError(400, `Minimum rental duration is ${MIN_RENTAL_HOURS} hours.`);
      }
      const available = await isCarAvailable({ carId: booking.car, pickupAt, dropAt, excludeBookingId: booking._id });
      if (!available) throw new ApiError(409, "This car is booked by another customer in the new period.");

      const rates = await ratesForBooking(booking);
      const newHours = calculateDurationHours(pickupAt, dropAt);
      const newBase = calculateBaseAmount(rates, newHours);
      const delta = newBase - booking.baseAmount;
      booking.pickupAt = pickupAt;
      booking.pickupDate = pickupAt;
      booking.pickupTime = body.pickupTime!;
      booking.dropAt = dropAt;
      booking.dropDate = dropAt;
      booking.dropTime = body.dropTime!;
      booking.durationHours = newHours;
      booking.baseAmount = newBase;
      booking.totalAmount += delta;
      changes.push(`Schedule changed to ${newHours} hrs; rental ${delta >= 0 ? "+" : "−"}₹${Math.abs(delta)}`);
    }
  }

  if (!changes.length) return res.json({ success: true, data: booking, message: "Nothing changed." });
  syncPaymentStatus(booking);
  await booking.save();
  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note: `Booking edited — ${changes.join("; ")}.`,
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, { action: "booking_edited", module: "bookings", recordId: String(booking._id), meta: { changes } });
  res.json({ success: true, data: booking });
});

// Closes (completes) a booking when the car comes back: records odometer /
// km driven, charges extra km at the booking's own rate, optional other
// charges (fuel, damage…), and the closure date.
export const adminCloseBooking = asyncHandler(async (req: Request, res: Response) => {
  const { closedAt, odometerStart, odometerEnd, kmDriven, otherCharges = 0, otherChargesNote, notes } = req.body as {
    closedAt?: string;
    odometerStart?: number;
    odometerEnd?: number;
    kmDriven?: number;
    otherCharges?: number;
    otherChargesNote?: string;
    notes?: string;
  };
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ApiError(400, "Only confirmed, car-assigned or active bookings can be closed.");
  }

  let driven = kmDriven;
  if (odometerStart !== undefined && odometerEnd !== undefined) {
    if (odometerEnd < odometerStart) throw new ApiError(400, "End odometer reading can't be less than the start reading.");
    driven = odometerEnd - odometerStart;
  }
  if (driven === undefined) throw new ApiError(400, "Enter the km driven or both odometer readings.");

  const when = closedAt ? new Date(closedAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new ApiError(400, "Invalid closure date/time.");

  const summary = await bookingSummary(booking);
  const { extraKm, charge } = extraKmCharge(driven, summary.includedKm, summary.extraKmRate);

  booking.closure = {
    closedAt: when,
    odometerStart,
    odometerEnd,
    kmDriven: Math.round(driven),
    includedKm: summary.includedKm,
    extraKm,
    extraKmCharge: charge,
    otherCharges,
    otherChargesNote: otherChargesNote?.trim() || undefined,
    notes: notes?.trim() || undefined,
    closedBy: new Types.ObjectId(req.admin!.id),
  };
  booking.kmPolicy = { kmPerDay: summary.kmPerDay, extraKmRate: summary.extraKmRate };
  booking.additionalCharges = (booking.additionalCharges ?? 0) + charge + otherCharges;
  booking.totalAmount += charge + otherCharges;
  booking.status = BookingStatus.COMPLETED;
  syncPaymentStatus(booking);
  await booking.save();

  const inrS = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  await BookingStatusHistory.create({
    booking: booking._id,
    status: BookingStatus.COMPLETED,
    note:
      `Booking closed. ${Math.round(driven)} km driven (${summary.includedKm} km included)` +
      (extraKm > 0 ? `, ${extraKm} extra km × ${inrS(summary.extraKmRate)} = ${inrS(charge)}` : "") +
      (otherCharges > 0 ? `; other charges ${inrS(otherCharges)}${otherChargesNote ? ` (${otherChargesNote})` : ""}` : "") +
      `. Balance due ${inrS(balanceDue(booking))}.` +
      (notes ? ` — ${notes}` : ""),
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, { action: "booking_closed", module: "bookings", recordId: String(booking._id), meta: { driven, extraKm, charge, otherCharges } });
  res.json({ success: true, data: booking });
});

// Soft delete: the booking disappears from the admin panel and the customer's
// account, but the record (payments, history) stays in the database. An
// active booking is cancelled first so the car is freed.
export const adminDeleteBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!["SUPER_ADMIN", "ADMIN"].includes(req.admin!.role)) {
    throw new ApiError(403, "Only an Admin or Super Admin can delete bookings.");
  }
  const { reason } = (req.body ?? {}) as { reason?: string };
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");

  const wasStatus = booking.status;
  if (ACTIVE_BOOKING_STATUSES.includes(booking.status) || booking.status === BookingStatus.PAYMENT_PENDING) {
    booking.status = BookingStatus.CANCELLED;
  }
  booking.deletedAt = new Date();
  booking.deletedBy = new Types.ObjectId(req.admin!.id);
  booking.deleteReason = reason?.trim() || undefined;
  await booking.save();

  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note: `Booking deleted by admin (was ${wasStatus}).${reason ? ` Reason: ${reason}` : ""} Payment records kept.`,
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, { action: "booking_deleted", module: "bookings", recordId: String(booking._id), meta: { wasStatus, reason } });
  res.json({ success: true, message: "Booking deleted." });
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
const ONLINE_METHOD_LABELS = { UPI: "UPI", BANK_TRANSFER: "bank transfer", CARD: "card", OTHER: "online" } as const;

export const adminCollectPayment = asyncHandler(async (req: Request, res: Response) => {
  const { cashAmount = 0, onlineAmount = 0, onlineMethod = "UPI", reference, receivedAt, note } = req.body as {
    cashAmount?: number;
    onlineAmount?: number;
    onlineMethod?: "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";
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
    entries.push({ mode: "ONLINE", method: onlineMethod, amount: onlineAmount, reference: reference?.trim(), receivedAt: when, note, recordedBy: adminId, createdAt: new Date() });
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

  const parts = [cashAmount > 0 && `${inr(cashAmount)} cash`, onlineAmount > 0 && `${inr(onlineAmount)} ${ONLINE_METHOD_LABELS[onlineMethod]} (UTR ${reference?.trim()})`].filter(Boolean);
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
    meta: { cashAmount, onlineAmount, onlineMethod, reference, status: booking.payment.status },
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
    kmPolicy: {
      kmPerDay: (await Setting.findOne({ key: "GLOBAL" }).lean())?.booking?.kmPerDay ?? DEFAULT_KM_PER_DAY,
      extraKmRate: car.extraKmRate ?? 0,
    },
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
