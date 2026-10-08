import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Car } from "../models/Car";
import { Location } from "../models/Location";
import { Booking } from "../models/Booking";
import { CarStatus, ACTIVE_BOOKING_STATUSES } from "../types/enums";
import { isCarAvailable, combineDateAndTime } from "../services/availability.service";
import { serializeCarSummary, serializeCarDetail } from "../utils/serializers";

export const listCars = asyncHandler(async (req: Request, res: Response) => {
  const {
    category, transmission, fuel, location, city, minPrice, maxPrice, search, featured,
    pickupDate, pickupTime, dropDate, dropTime,
    page = "1", limit = "100",
  } = req.query as Record<string, string>;

  const query: Record<string, unknown> = { status: { $ne: CarStatus.INACTIVE } };
  if (category) query.category = category;
  if (transmission) query.transmission = transmission;
  if (fuel) query.fuel = fuel;
  if (location) query.location = location;
  if (city) {
    const loc = await Location.findOne({ city: { $regex: `^${city}$`, $options: "i" } });
    query.location = loc ? loc._id : null; // no match -> empty result set, not "ignore filter"
  }
  if (featured === "true") query.isFeatured = true;
  if (minPrice || maxPrice) {
    query.pricePerDay = { ...(minPrice ? { $gte: Number(minPrice) } : {}), ...(maxPrice ? { $lte: Number(maxPrice) } : {}) };
  }
  if (search) {
    query.$or = [{ name: { $regex: search, $options: "i" } }, { brand: { $regex: search, $options: "i" } }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));

  const [cars, total] = await Promise.all([
    Car.find(query)
      .sort("-createdAt")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Car.countDocuments(query),
  ]);

  let unavailableCarIds = new Set<string>();
  if (pickupDate && pickupTime && dropDate && dropTime) {
    const pickupAt = combineDateAndTime(pickupDate, pickupTime);
    const dropAt = combineDateAndTime(dropDate, dropTime);
    if (dropAt > pickupAt) {
      const conflicts = await Booking.find({
        car: { $in: cars.map((c) => c._id) },
        status: { $in: ACTIVE_BOOKING_STATUSES },
        pickupAt: { $lt: dropAt },
        dropAt: { $gt: pickupAt },
      }).distinct("car");
      unavailableCarIds = new Set(conflicts.map((id) => String(id)));
    }
  }

  res.json({
    success: true,
    data: cars.map((c) => ({
      ...serializeCarSummary(c),
      available: c.status === CarStatus.AVAILABLE && !unavailableCarIds.has(String(c._id)),
    })),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const getCarBySlug = asyncHandler(async (req: Request, res: Response) => {
  const car = await Car.findOne({ slug: req.params.slug, status: { $ne: CarStatus.INACTIVE } }).populate(
    "location",
    "city region slug"
  );
  if (!car) throw new ApiError(404, "Car not found.");
  res.json({ success: true, data: serializeCarDetail(car) });
});

export const checkCarAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { pickupDate, pickupTime, dropDate, dropTime } = req.query as Record<string, string>;
  if (!pickupDate || !pickupTime || !dropDate || !dropTime) {
    throw new ApiError(400, "pickupDate, pickupTime, dropDate and dropTime are required.");
  }

  const car = await Car.findById(req.params.id);
  if (!car) throw new ApiError(404, "Car not found.");

  const pickupAt = combineDateAndTime(pickupDate, pickupTime);
  const dropAt = combineDateAndTime(dropDate, dropTime);
  if (dropAt <= pickupAt) throw new ApiError(400, "Drop date/time must be after pickup date/time.");

  if (car.status === CarStatus.MAINTENANCE || car.status === CarStatus.INACTIVE) {
    return res.json({ success: true, data: { available: false, reason: "Car is currently unavailable." } });
  }

  const available = await isCarAvailable({ carId: car._id, pickupAt, dropAt });
  res.json({
    success: true,
    data: { available, reason: available ? undefined : "Car is already booked for these dates." },
  });
});
