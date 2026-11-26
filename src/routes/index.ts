import { Router } from "express";

import authRoutes from "./auth.routes";
import carRoutes from "./car.routes";
import bookingRoutes from "./booking.routes";
import couponRoutes from "./coupon.routes";
import contactRoutes from "./contact.routes";
import carLeadRoutes from "./carLead.routes";
import contentRoutes from "./content.routes";
import cmsRoutes from "./cms.routes";
import userRoutes from "./user.routes";
import seoRoutes from "./seo.routes";
import landingPageRoutes from "./landingPage.routes";
import adminRoutes from "./admin";

const router = Router();

router.use("/auth", authRoutes);
router.use("/cars", carRoutes);
router.use("/bookings", bookingRoutes);
router.use("/coupons", couponRoutes);
router.use("/contact", contactRoutes);
router.use("/car-leads", carLeadRoutes);
router.use("/user", userRoutes);
router.use("/seo", seoRoutes);
router.use("/landing-pages", landingPageRoutes);
router.use("/admin", adminRoutes);
router.use("/", contentRoutes);
router.use("/", cmsRoutes);

export default router;
