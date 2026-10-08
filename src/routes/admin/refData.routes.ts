import { Router } from "express";
import {
  locationController,
  couponController,
  offerController,
  blogCategoryController,
  faqController,
  testimonialController,
  journeyController,
  ensureSlugFromField,
  ensureJourneySlug,
} from "../../controllers/admin/refData.controller";
import { requirePermission } from "../../middleware/adminAuth";

export function buildLocationsRouter() {
  const router = Router();
  router.use(requirePermission("locations"));
  router.get("/", locationController.list);
  router.post("/", ensureSlugFromField("city"), locationController.create);
  router.get("/:id", locationController.getById);
  router.put("/:id", ensureSlugFromField("city"), locationController.update);
  router.delete("/:id", locationController.remove);
  return router;
}

export function buildCouponsRouter() {
  const router = Router();
  router.use(requirePermission("coupons"));
  router.get("/", couponController.list);
  router.post("/", couponController.create);
  router.get("/:id", couponController.getById);
  router.put("/:id", couponController.update);
  router.delete("/:id", couponController.remove);
  return router;
}

export function buildOffersRouter() {
  const router = Router();
  router.use(requirePermission("offers"));
  router.get("/", offerController.list);
  router.post("/", offerController.create);
  router.get("/:id", offerController.getById);
  router.put("/:id", offerController.update);
  router.delete("/:id", offerController.remove);
  return router;
}

export function buildBlogCategoriesRouter() {
  const router = Router();
  router.use(requirePermission("blogs"));
  router.get("/", blogCategoryController.list);
  router.post("/", ensureSlugFromField("name"), blogCategoryController.create);
  router.get("/:id", blogCategoryController.getById);
  router.put("/:id", ensureSlugFromField("name"), blogCategoryController.update);
  router.delete("/:id", blogCategoryController.remove);
  return router;
}

export function buildFaqsRouter() {
  const router = Router();
  router.use(requirePermission("faqs"));
  router.get("/", faqController.list);
  router.post("/", faqController.create);
  router.get("/:id", faqController.getById);
  router.put("/:id", faqController.update);
  router.delete("/:id", faqController.remove);
  return router;
}

export function buildTestimonialsRouter() {
  const router = Router();
  router.use(requirePermission("testimonials"));
  router.get("/", testimonialController.list);
  router.post("/", testimonialController.create);
  router.get("/:id", testimonialController.getById);
  router.put("/:id", testimonialController.update);
  router.delete("/:id", testimonialController.remove);
  return router;
}

export function buildJourneysRouter() {
  const router = Router();
  router.use(requirePermission("blogs"));
  router.get("/", journeyController.list);
  router.post("/", ensureJourneySlug, journeyController.create);
  router.get("/:id", journeyController.getById);
  router.put("/:id", ensureJourneySlug, journeyController.update);
  router.delete("/:id", journeyController.remove);
  return router;
}
