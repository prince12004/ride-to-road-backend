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
    pickupDate, pickupTime, dropDate, dropTime, availableOnly, sort,
    page = "1", limit = "100",
  } = req.query as Record<string, string>;

  const query: Record<string, unknown> = { status: { $ne: CarStatus.INACTIVE } };
  // availableOnly=true hides cars shown as "Sold Out" (booked / under maintenance).
  if (availableOnly === "true") query.status = CarStatus.AVAILABLE;
  if (category) query.category = category;
  if (transmission) query.transmission = transmission;
  if (fuel) query.fuel = fuel;
  if (location) query.location = location;
  let cityLocationId: string | null = null;
  if (city) {
    const loc = await Location.findOne({ city: { $regex: `^${city}$`, $options: "i" } });
    if (loc?.showAllCars) {
      // Admin chose to offer the whole fleet in this city (e.g. via delivery);
      // cars based here are still listed first below.
      cityLocationId = String(loc._id);
    } else if (loc) {
      // Cars based here, also offered here, or offered in every city.
      cityLocationId = String(loc._id);
      query.$and = [{ $or: [{ location: loc._id }, { cities: loc._id }, { allCities: true }] }];
    } else {
      query.location = null; // unknown city -> empty result set, not "ignore filter"
    }
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
      // Cars the admin marks "Featured" lead every list, newest first after that.
      .sort(sort === "latest" ? "-createdAt" : "-isFeatured -createdAt")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Car.countDocuments(query),
  ]);

  if (cityLocationId) {
    // Stable sort: cars based in the searched city first, order otherwise kept.
    cars.sort((a, b) => Number(String(b.location) === cityLocationId) - Number(String(a.location) === cityLocationId));
  }

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
