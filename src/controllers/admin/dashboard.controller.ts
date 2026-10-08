import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { Car } from "../../models/Car";
import { Booking } from "../../models/Booking";
import { User } from "../../models/User";
import { CarStatus, BookingStatus, PaymentStatus } from "../../types/enums";

export const adminGetDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalCars, availableCars, totalBookings, confirmedBookings, pendingPaymentBookings,
    completedBookings, cancelledBookings, totalUsers, revenueAgg, recentBookings, recentUsers,
  ] = await Promise.all([
    Car.countDocuments(),
    Car.countDocuments({ status: CarStatus.AVAILABLE }),
    Booking.countDocuments(),
    Booking.countDocuments({ status: BookingStatus.CONFIRMED }),
    Booking.countDocuments({ status: { $in: [BookingStatus.PAYMENT_PENDING, BookingStatus.PAYMENT_FAILED] } }),
    Booking.countDocuments({ status: BookingStatus.COMPLETED }),
    Booking.countDocuments({ status: BookingStatus.CANCELLED }),
    User.countDocuments(),
    Booking.aggregate([
      { $match: { "payment.status": PaymentStatus.PAID } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    Booking.find().populate("car", "name brand").sort("-createdAt").limit(8),
    User.find().sort("-createdAt").limit(8).select("name mobile createdAt"),
  ]);

  // Last 14 days of confirmed-booking revenue, for a simple trend chart.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const dailyRevenue = await Booking.aggregate([
    { $match: { "payment.status": PaymentStatus.PAID, "payment.paidAt": { $gte: fourteenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$payment.paidAt" } },
        total: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    success: true,
    data: {
      totalCars,
      availableCars,
      totalBookings,
      confirmedBookings,
      pendingPaymentBookings,
      completedBookings,
      cancelledBookings,
      totalUsers,
      totalRevenue: revenueAgg[0]?.total ?? 0,
      recentBookings,
      recentUsers,
      dailyRevenue: dailyRevenue.map((d) => ({ date: d._id, total: d.total, count: d.count })),
    },
  });
});
