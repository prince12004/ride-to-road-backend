import { Router } from "express";
import * as couponController from "../controllers/coupon.controller";
import { validateBody } from "../middleware/validate";
import { validateCouponSchema } from "../validators/booking.validator";

const router = Router();

router.post("/validate", validateBody(validateCouponSchema), couponController.validateCoupon);

export default router;
