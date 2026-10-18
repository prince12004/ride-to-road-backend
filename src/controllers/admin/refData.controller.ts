import slugify from "slugify";
import { Request, Response, NextFunction } from "express";
import { Location } from "../../models/Location";
import { Coupon } from "../../models/Coupon";
import { Offer } from "../../models/Offer";
import { BlogCategory } from "../../models/BlogCategory";
import { Faq } from "../../models/Faq";
import { Testimonial } from "../../models/Testimonial";
import { Journey } from "../../models/Journey";
import { Booking } from "../../models/Booking";
import { Car } from "../../models/Car";
import { Blog } from "../../models/Blog";
import { createCrudController } from "../../utils/crudFactory";

// Bookings are counted including soft-deleted ones: they are still financial records.
const bookingsUsing = (filter: Record<string, unknown>) => Booking.countDocuments(filter).setOptions({ includeDeleted: true });

export const locationController = createCrudController(Location, {
  moduleName: "location",
  searchFields: ["city", "region"],
  beforeRemove: async (id) => {
    const [cars, bookings] = await Promise.all([
      Car.countDocuments({ $or: [{ location: id }, { cities: id }] }),
      bookingsUsing({ $or: [{ pickupLocation: id }, { dropLocation: id }] }),
    ]);
    if (cars) return `${cars} car(s) are listed in this location. Move them to another location first, or mark the location inactive.`;
    if (bookings) return `${bookings} booking(s) use this location, so it can't be deleted. Mark it inactive instead.`;
  },
});
export const couponController = createCrudController(Coupon, {
  moduleName: "coupon",
  searchFields: ["code", "description"],
  populate: "applicableCars",
  beforeRemove: async (id) => {
    const bookings = await bookingsUsing({ coupon: id });
    if (bookings) return `This coupon was used on ${bookings} booking(s), so it can't be deleted. Mark it inactive instead.`;
  },
});
export const offerController = createCrudController(Offer, { moduleName: "offer", searchFields: ["title", "description"] });
export const blogCategoryController = createCrudController(BlogCategory, {
  moduleName: "blogCategory",
  searchFields: ["name"],
  beforeRemove: async (id) => {
    const blogs = await Blog.countDocuments({ category: id });
    if (blogs) return `${blogs} blog post(s) are in this category. Move them to another category first.`;
  },
});
export const faqController = createCrudController(Faq, { moduleName: "faq", searchFields: ["question", "answer"], defaultSort: "order" });
export const testimonialController = createCrudController(Testimonial, { moduleName: "testimonial", searchFields: ["name", "location"] });
export const journeyController = createCrudController(Journey, { moduleName: "journey", searchFields: ["from", "to"] });

export function ensureSlugFromField(field: "name" | "city" | "title" | "from") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.body.slug && req.body[field]) {
      req.body.slug = slugify(String(req.body[field]), { lower: true, strict: true });
    }
    next();
  };
}

// Journeys are keyed by from+to (e.g. "Delhi" -> "Agra" and "Delhi" -> "Jaipur"
// must not collide just because they share the same origin city), with a
// numeric suffix if that exact route already exists.
export async function ensureJourneySlug(req: Request, _res: Response, next: NextFunction) {
  if (req.body.slug) return next();
  if (!req.body.from || !req.body.to) return next();

  const base = slugify(`${req.body.from}-to-${req.body.to}`, { lower: true, strict: true });
  let slug = base;
  let count = 1;
  const excludeId = req.params.id;
  while (await Journey.findOne({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    slug = `${base}-${count++}`;
  }
  req.body.slug = slug;
  next();
}
