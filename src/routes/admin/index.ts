import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";

import adminAuthRoutes from "./adminAuth.routes";
import carRoutes from "./car.routes";
import bookingRoutes from "./booking.routes";
import customerRoutes from "./customer.routes";
import blogRoutes from "./blog.routes";
import contactEnquiryRoutes from "./contactEnquiry.routes";
import cmsRoutes from "./cms.routes";
import adminUserRoutes from "./adminUser.routes";
import activityLogRoutes from "./activityLog.routes";
import dashboardRoutes from "./dashboard.routes";
import uploadRoutes from "./upload.routes";
import {
  buildLocationsRouter,
  buildCouponsRouter,
  buildOffersRouter,
  buildBlogCategoriesRouter,
  buildFaqsRouter,
  buildTestimonialsRouter,
  buildJourneysRouter,
} from "./refData.routes";

const router = Router();

router.use("/auth", adminAuthRoutes);

router.use(requireAdminAuth);

router.use("/dashboard", dashboardRoutes);
router.use("/cars", carRoutes);
router.use("/bookings", bookingRoutes);
router.use("/customers", customerRoutes);
router.use("/locations", buildLocationsRouter());
router.use("/coupons", buildCouponsRouter());
router.use("/offers", buildOffersRouter());
router.use("/blogs", blogRoutes);
router.use("/blog-categories", buildBlogCategoriesRouter());
router.use("/faqs", buildFaqsRouter());
router.use("/testimonials", buildTestimonialsRouter());
router.use("/journeys", buildJourneysRouter());
router.use("/contact-enquiries", contactEnquiryRoutes);
router.use("/cms", cmsRoutes);
router.use("/users", adminUserRoutes);
router.use("/activity-logs", activityLogRoutes);
router.use("/upload", uploadRoutes);

export default router;
