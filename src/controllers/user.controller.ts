import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { User } from "../models/User";
import { Booking } from "../models/Booking";
import { BookingStatus, VerificationStatus } from "../types/enums";
import { validateDocumentFile, uploadPrivateFile } from "../services/upload.service";

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

export const VERIFICATION_DOCUMENT_TYPES = ["Aadhaar Card", "Driving Licence", "PAN Card", "Other Documents"] as const;
const VERIFICATION_FOLDER = "verification-documents";

export const submitVerification = asyncHandler(async (req: Request, res: Response) => {
  const { documents } = req.body as { documents: { type: string; url: string; publicId: string }[] };
  if (!Array.isArray(documents) || !documents.length) throw new ApiError(400, "At least one document is required.");

  for (const doc of documents) {
    if (!VERIFICATION_DOCUMENT_TYPES.includes(doc?.type as (typeof VERIFICATION_DOCUMENT_TYPES)[number])) {
      throw new ApiError(400, "Unknown document type.");
    }
    // Only accept files that were uploaded through our own upload endpoint.
    if (typeof doc.publicId !== "string" || !doc.publicId.startsWith(`ride-to-road/${VERIFICATION_FOLDER}/`) || typeof doc.url !== "string") {
      throw new ApiError(400, "Please upload the document again.");
    }
  }

  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, "User not found.");

  // Merge by type: re-submitting one document must not drop the others
  // already on file (e.g. adding a PAN after the Aadhaar was sent).
  const incomingTypes = new Set(documents.map((d) => d.type));
  const kept = (user.verification?.documents ?? []).filter((d) => !incomingTypes.has(d.type));

  user.verification = {
    status: VerificationStatus.PENDING,
    documents: [...kept, ...documents.map(({ type, url, publicId }) => ({ type, url, publicId }))],
    rejectionReason: undefined,
    submittedAt: new Date(),
    reviewedAt: undefined,
  };
  await user.save();

  res.json({ success: true, data: user.verification });
});

export const uploadMyDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "Please choose a file to upload.");

  const kind = validateDocumentFile(file, { allowPdf: true });
  const result = await uploadPrivateFile(file.buffer, VERIFICATION_FOLDER, kind);
  res.status(201).json({ success: true, data: result });
});
