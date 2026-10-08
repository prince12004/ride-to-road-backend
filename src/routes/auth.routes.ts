import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { validateBody } from "../middleware/validate";
import { requestOtpSchema, verifyOtpSchema } from "../validators/auth.validator";
import { requireAuth } from "../middleware/auth";
import { otpRateLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/request-otp", otpRateLimiter, validateBody(requestOtpSchema), authController.requestOtp);
router.post("/verify-otp", otpRateLimiter, validateBody(verifyOtpSchema), authController.verifyOtp);
router.post("/refresh", authController.refresh);
router.post("/logout", requireAuth, authController.logout);
router.get("/me", requireAuth, authController.getMe);

export default router;
