import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { User } from "../../models/User";
import { Booking } from "../../models/Booking";
import { VerificationStatus } from "../../types/enums";
import { logActivity } from "../../services/activityLog.service";

export const adminListCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { search, verificationStatus, page = "1", limit = "20" } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (verificationStatus) query["verification.status"] = verificationStatus;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [customers, total] = await Promise.all([
    User.find(query).sort("-createdAt").skip((pageNum - 1) * limitNum).limit(limitNum),
    User.countDocuments(query),
  ]);

  const bookingCounts = await Booking.aggregate([
    { $match: { user: { $in: customers.map((c) => c._id) } } },
    { $group: { _id: "$user", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(bookingCounts.map((b) => [String(b._id), b.count]));

  res.json({
    success: true,
    data: customers.map((c) => ({ ...c.toObject(), bookingsCount: countMap.get(String(c._id)) ?? 0 })),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const adminGetCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await User.findById(req.params.id);
  if (!customer) throw new ApiError(404, "Customer not found.");

  const bookings = await Booking.find({ user: customer._id }).populate("car", "name brand slug").sort("-createdAt");
  res.json({ success: true, data: { customer, bookings } });
});

export const adminSetCustomerBlockStatus = asyncHandler(async (req: Request, res: Response) => {
  const { isBlocked } = req.body as { isBlocked: boolean };
  const customer = await User.findByIdAndUpdate(req.params.id, { isBlocked }, { new: true });
  if (!customer) throw new ApiError(404, "Customer not found.");
  await logActivity(req, { action: isBlocked ? "customer_blocked" : "customer_unblocked", module: "customers", recordId: String(customer._id) });
  res.json({ success: true, data: customer });
});

export const adminListVerificationRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status = VerificationStatus.PENDING } = req.query as Record<string, string>;
  const customers = await User.find({ "verification.status": status }).sort("-verification.submittedAt");
  res.json({ success: true, data: customers });
});

export const adminReviewVerification = asyncHandler(async (req: Request, res: Response) => {
  const { status, rejectionReason } = req.body as { status: VerificationStatus; rejectionReason?: string };
  if (![VerificationStatus.VERIFIED, VerificationStatus.REJECTED].includes(status)) {
    throw new ApiError(400, "Status must be VERIFIED or REJECTED.");
  }

  const customer = await User.findById(req.params.id);
  if (!customer) throw new ApiError(404, "Customer not found.");

  customer.verification.status = status;
  customer.verification.rejectionReason = status === VerificationStatus.REJECTED ? rejectionReason : undefined;
  customer.verification.reviewedAt = new Date();
  await customer.save();

  await logActivity(req, { action: "verification_reviewed", module: "customers", recordId: String(customer._id), meta: { status } });
  res.json({ success: true, data: customer });
});
