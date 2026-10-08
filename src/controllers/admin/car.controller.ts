import { Request, Response } from "express";
import slugify from "slugify";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { Car } from "../../models/Car";
import { Booking } from "../../models/Booking";
import { CarStatus } from "../../types/enums";
import { logActivity } from "../../services/activityLog.service";

async function generateUniqueSlug(name: string) {
  const base = slugify(name, { lower: true, strict: true });
  let slug = base;
  let count = 1;
  while (await Car.findOne({ slug })) slug = `${base}-${count++}`;
  return slug;
}

export const adminListCars = asyncHandler(async (req: Request, res: Response) => {
  const { search, location, category, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {};
  if (location) query.location = location;
  if (category) query.category = category;
  if (status) query.status = status;
  if (search) query.$or = [{ name: { $regex: search, $options: "i" } }, { brand: { $regex: search, $options: "i" } }];

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [cars, total] = await Promise.all([
    Car.find(query)
      .populate("location", "city region")
      .sort("-createdAt")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Car.countDocuments(query),
  ]);

  const bookingCounts = await Booking.aggregate([
    { $match: { car: { $in: cars.map((c) => c._id) } } },
    { $group: { _id: "$car", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(bookingCounts.map((b) => [String(b._id), b.count]));

  res.json({
    success: true,
    data: cars.map((c) => ({ ...c.toObject(), bookingsCount: countMap.get(String(c._id)) ?? 0 })),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const adminGetCar = asyncHandler(async (req: Request, res: Response) => {
  const car = await Car.findById(req.params.id).populate("location");
  if (!car) throw new ApiError(404, "Car not found.");
  res.json({ success: true, data: car });
});

export const adminCreateCar = asyncHandler(async (req: Request, res: Response) => {
  const payload = { ...req.body };
  if (!payload.slug) payload.slug = await generateUniqueSlug(payload.name);

  const car = await Car.create(payload);
  await logActivity(req, { action: "car_created", module: "cars", recordId: String(car._id) });
  res.status(201).json({ success: true, data: car });
});

export const adminUpdateCar = asyncHandler(async (req: Request, res: Response) => {
  const car = await Car.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!car) throw new ApiError(404, "Car not found.");
  await logActivity(req, { action: "car_updated", module: "cars", recordId: String(car._id) });
  res.json({ success: true, data: car });
});

export const adminDeleteCar = asyncHandler(async (req: Request, res: Response) => {
  const car = await Car.findByIdAndDelete(req.params.id);
  if (!car) throw new ApiError(404, "Car not found.");
  await logActivity(req, { action: "car_deleted", module: "cars", recordId: String(car._id) });
  res.json({ success: true, message: "Car deleted." });
});

export const adminDuplicateCar = asyncHandler(async (req: Request, res: Response) => {
  const original = await Car.findById(req.params.id).lean();
  if (!original) throw new ApiError(404, "Car not found.");

  const { _id, slug, createdAt, updatedAt, ...rest } = original as Record<string, unknown> & {
    _id: unknown; slug: string; createdAt: unknown; updatedAt: unknown;
  };
  const newSlug = await generateUniqueSlug(`${rest.name}-copy`);
  const duplicate = await Car.create({ ...rest, slug: newSlug, isFeatured: false });

  await logActivity(req, { action: "car_duplicated", module: "cars", recordId: String(duplicate._id) });
  res.status(201).json({ success: true, data: duplicate });
});

export const adminUpdateCarStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: CarStatus };
  if (!Object.values(CarStatus).includes(status)) throw new ApiError(400, "Invalid car status.");

  const car = await Car.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!car) throw new ApiError(404, "Car not found.");
  await logActivity(req, { action: "car_status_updated", module: "cars", recordId: String(car._id), meta: { status } });
  res.json({ success: true, data: car });
});

export const adminToggleFeatured = asyncHandler(async (req: Request, res: Response) => {
  const car = await Car.findById(req.params.id);
  if (!car) throw new ApiError(404, "Car not found.");
  car.isFeatured = !car.isFeatured;
  await car.save();
  await logActivity(req, { action: "car_featured_toggled", module: "cars", recordId: String(car._id), meta: { isFeatured: car.isFeatured } });
  res.json({ success: true, data: car });
});
