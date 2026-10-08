import { Router } from "express";
import * as content from "../controllers/content.controller";

const router = Router();

router.get("/locations", content.listLocations);
router.get("/offers/featured", content.getFeaturedOffer);
router.get("/testimonials", content.listTestimonials);
router.get("/faqs", content.listFaqs);
router.get("/journeys", content.listJourneys);
router.get("/blogs", content.listBlogs);
router.get("/blogs/:slug", content.getBlogBySlug);

export default router;
