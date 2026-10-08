import { Router } from "express";

import authRoutes from "./auth.routes";
import carRoutes from "./car.routes";
import bookingRoutes from "./booking.routes";
import couponRoutes from "./coupon.routes";
import contactRoutes from "./contact.routes";
import contentRoutes from "./content.routes";
import cmsRoutes from "./cms.routes";
import userRoutes from "./user.routes";
import adminRoutes from "./admin";

const router = Router();

router.use("/auth", authRoutes);
router.use("/cars", carRoutes);
router.use("/bookings", bookingRoutes);
router.use("/coupons", couponRoutes);
router.use("/contact", contactRoutes);
router.use("/user", userRoutes);
router.use("/admin", adminRoutes);
router.use("/", contentRoutes);
router.use("/", cmsRoutes);

export default router;
