import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { User } from "../models/User";
import { Booking } from "../models/Booking";
import { BookingStatus, VerificationStatus } from "../types/enums";
import { validateDocumentFile, uploadPrivateFile, deletePrivateFile } from "../services/upload.service";

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
  // The profile photo is changed only through uploadProfileImage, never from a client-supplied URL.
  const { name, email, address, city, state, pincode } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { name, email, address, city, state, pincode },
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

export const VERIFICATION_DOCUMENT_TYPES = [
  "Aadhaar Card (Front)",
  "Aadhaar Card (Back)",
  "Driving Licence (Front)",
  "Driving Licence (Back)",
  "PAN Card",
  "Other Documents",
  // Single-image types used before front/back were split — still accepted so
  // earlier submissions stay valid.
  "Aadhaar Card",
  "Driving Licence",
] as const;
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

const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

// Uploads (or replaces) the customer's profile photo: JPG/PNG/WEBP up to 2MB,
// stored privately like KYC files; the previous photo is removed.
export const uploadProfileImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "Please choose a photo to upload.");
  if (file.size > PROFILE_IMAGE_MAX_BYTES) throw new ApiError(400, "Photo must be under 2MB.");
  const kind = validateDocumentFile(file, { allowPdf: false });

  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, "User not found.");
  const previous = user.profileImage?.publicId;

  user.profileImage = await uploadPrivateFile(file.buffer, "profile-images", kind);
  await user.save();
  if (previous) await deletePrivateFile(previous);
  res.status(201).json({ success: true, data: { profileImage: { url: user.profileImage.url } } });
});

export const removeProfileImage = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, "User not found.");
  const previous = user.profileImage?.publicId;
  user.profileImage = undefined;
  await user.save();
  if (previous) await deletePrivateFile(previous);
  res.json({ success: true, message: "Profile photo removed." });
});

// The ID numbers typed next to the KYC uploads (printed on the booking form).
// "" clears a number; formats are checked by documentNumbersSchema.
export const updateDocumentNumbers = asyncHandler(async (req: Request, res: Response) => {
  const { aadhaarNumber, dlNumber, panNumber } = req.body as { aadhaarNumber?: string; dlNumber?: string; panNumber?: string };
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, "User not found.");
  const current = user.documentNumbers ?? {};
  const pick = (v: string | undefined, prev?: string) => (v === undefined ? prev : v || undefined);
  user.documentNumbers = {
    aadhaar: pick(aadhaarNumber, current.aadhaar),
    drivingLicence: pick(dlNumber, current.drivingLicence),
    pan: pick(panNumber, current.pan),
  };
  await user.save();
  res.json({ success: true, data: { documentNumbers: user.documentNumbers } });
});
