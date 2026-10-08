import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { Types } from "mongoose";
import { Booking } from "../../models/Booking";
import { BookingStatusHistory } from "../../models/BookingStatusHistory";
import { Car } from "../../models/Car";
import { Location } from "../../models/Location";
import { BookingStatus, PaymentStatus, PaymentMethod, BookingSource, ACTIVE_BOOKING_STATUSES } from "../../types/enums";
import { logActivity } from "../../services/activityLog.service";
import { isCarAvailable, combineDateAndTime } from "../../services/availability.service";
import { generateBookingId } from "../../utils/bookingId";
import { calculateBaseAmount, calculateDurationHours } from "../../services/priceCalculator.service";

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

// Extends the drop date/time of a live booking (customer keeping the car
// longer). Checks the car is free for the extra period, records the extra
// charge and whether it was collected, and keeps an audit trail.
export const adminExtendBooking = asyncHandler(async (req: Request, res: Response) => {
  const { dropDate, dropTime, amount, paymentStatus, paymentMethod, note } = req.body as {
    dropDate: string;
    dropTime: string;
    amount?: number;
    paymentStatus: "PAID" | "PENDING";
    paymentMethod?: PaymentMethod;
    note?: string;
  };

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ApiError(400, "Only confirmed, car-assigned or active bookings can be extended.");
  }

  const previousDropAt = booking.dropAt;
  const newDropAt = combineDateAndTime(dropDate, dropTime);
  if (Number.isNaN(newDropAt.getTime())) throw new ApiError(400, "Invalid drop date/time.");
  if (newDropAt <= previousDropAt) throw new ApiError(400, "New drop date/time must be after the current drop time.");

  const available = await isCarAvailable({
    carId: booking.car,
    pickupAt: previousDropAt,
    dropAt: newDropAt,
    excludeBookingId: booking._id,
  });
  if (!available) throw new ApiError(409, "This car is booked by another customer during the extended period.");

  let extensionAmount = amount;
  if (extensionAmount === undefined) {
    const car = await Car.findById(booking.car);
    if (!car) throw new ApiError(404, "Car for this booking was not found.");
    const oldHours = calculateDurationHours(booking.pickupAt, previousDropAt);
    const newHours = calculateDurationHours(booking.pickupAt, newDropAt);
    extensionAmount = Math.max(0, calculateBaseAmount(car, newHours) - calculateBaseAmount(car, oldHours));
  }

  const extraHours = Math.ceil((newDropAt.getTime() - previousDropAt.getTime()) / (1000 * 60 * 60));

  booking.dropDate = newDropAt;
  booking.dropTime = dropTime;
  booking.dropAt = newDropAt;
  booking.durationHours = calculateDurationHours(booking.pickupAt, newDropAt);
  booking.extensionCharges = (booking.extensionCharges ?? 0) + extensionAmount;
  booking.totalAmount += extensionAmount;
  booking.extensions.push({
    previousDropAt,
    newDropAt,
    extraHours,
    amount: extensionAmount,
    paymentStatus: paymentStatus === "PAID" ? PaymentStatus.PAID : PaymentStatus.PENDING,
    paymentMethod: paymentStatus === "PAID" ? paymentMethod : undefined,
    note,
    extendedBy: new Types.ObjectId(req.admin!.id),
    createdAt: new Date(),
  });
  await booking.save();

  const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  await BookingStatusHistory.create({
    booking: booking._id,
    status: booking.status,
    note: `Extended: drop ${fmt(previousDropAt)} → ${fmt(newDropAt)} (+₹${extensionAmount}, ${paymentStatus === "PAID" ? "collected" : "payment pending"})${note ? ` — ${note}` : ""}`,
    changedByAdmin: req.admin!.id,
  });
  await logActivity(req, {
    action: "booking_extended",
    module: "bookings",
    recordId: String(booking._id),
    meta: { previousDropAt, newDropAt, amount: extensionAmount, paymentStatus },
  });

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
    status: BookingStatus.CONFIRMED,
    source: BookingSource.ADMIN_OFFLINE,
    adminNotes,
    payment: { status: PaymentStatus.PAID, method: paymentMethod, amount: totalAmount, paidAt: new Date() },
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
