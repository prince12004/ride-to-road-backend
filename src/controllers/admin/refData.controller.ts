import slugify from "slugify";
import { Request, Response, NextFunction } from "express";
import { Location } from "../../models/Location";
import { Coupon } from "../../models/Coupon";
import { Offer } from "../../models/Offer";
import { BlogCategory } from "../../models/BlogCategory";
import { Faq } from "../../models/Faq";
import { Testimonial } from "../../models/Testimonial";
import { Journey } from "../../models/Journey";
import { createCrudController } from "../../utils/crudFactory";

export const locationController = createCrudController(Location, { moduleName: "location", searchFields: ["city", "region"] });
export const couponController = createCrudController(Coupon, { moduleName: "coupon", searchFields: ["code", "description"], populate: "applicableCars" });
export const offerController = createCrudController(Offer, { moduleName: "offer", searchFields: ["title", "description"] });
export const blogCategoryController = createCrudController(BlogCategory, { moduleName: "blogCategory", searchFields: ["name"] });
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
