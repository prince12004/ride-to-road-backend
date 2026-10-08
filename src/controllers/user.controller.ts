import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { User } from "../models/User";
import { Booking } from "../models/Booking";
import { BookingStatus, VerificationStatus } from "../types/enums";
import { validateImageFile, uploadBufferToCloudinary } from "../services/upload.service";

export const getDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [total, upcoming, completed, cancelled, pendingPayment] = await Promise.all([
    Booking.countDocuments({ user: userId }),
    Booking.countDocuments({
      user: userId,
      status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CAR_ASSIGNED, BookingStatus.ACTIVE] },
      pickupAt: { $gte: new Date() },
    }),
    Booking.countDocuments({ user: userId, status: BookingStatus.COMPLETED }),
    Booking.countDocuments({ user: userId, status: BookingStatus.CANCELLED }),
    Booking.countDocuments({ user: userId, status: { $in: [BookingStatus.PAYMENT_PENDING, BookingStatus.PAYMENT_FAILED] } }),
  ]);

  const nextBooking = await Booking.findOne({
    user: userId,
    pickupAt: { $gte: new Date() },
    status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CAR_ASSIGNED, BookingStatus.ACTIVE] },
  })
    .populate("car", "name brand slug mainImage")
    .sort("pickupAt");

  res.json({
    success: true,
    data: {
      totalBookings: total,
      upcomingBookings: upcoming,
      completedBookings: completed,
      cancelledBookings: cancelled,
      pendingPaymentBookings: pendingPayment,
      nextBooking,
    },
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, address, city, state, pincode, profileImage } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { name, email, address, city, state, pincode, ...(profileImage ? { profileImage } : {}) },
    { new: true, runValidators: true }
  );
  if (!user) throw new ApiError(404, "User not found.");
  res.json({ success: true, data: user });
});

export const listMyBookingHistory = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await Booking.find({ user: req.user!.id })
    .populate("car", "name brand slug mainImage pricePerDay")
    .sort("-createdAt");
  res.json({ success: true, data: bookings });
});

export const submitVerification = asyncHandler(async (req: Request, res: Response) => {
  const { documents } = req.body as { documents: { type: string; url: string; publicId: string }[] };
  if (!documents?.length) throw new ApiError(400, "At least one document is required.");

  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, "User not found.");

  user.verification = {
    status: VerificationStatus.PENDING,
    documents,
    rejectionReason: undefined,
    submittedAt: new Date(),
    reviewedAt: undefined,
  };
  await user.save();

  res.json({ success: true, data: user.verification });
});

export const uploadMyDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "No file was uploaded.");

  try {
    validateImageFile(file);
  } catch (err) {
    throw new ApiError(400, (err as Error).message);
  }

  const result = await uploadBufferToCloudinary(file.buffer, "verification-documents");
  res.status(201).json({ success: true, data: result });
});
