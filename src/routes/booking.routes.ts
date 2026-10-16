import { Router } from "express";
import * as bookingController from "../controllers/booking.controller";
import { validateBody } from "../middleware/validate";
import { initiateBookingSchema, verifyPaymentSchema, paymentFailedSchema } from "../validators/booking.validator";
import { requireAuth } from "../middleware/auth";
import { bookingRateLimiter } from "../middleware/rateLimit";
import { upload } from "../middleware/upload";
import { env } from "../config/env";

const router = Router();

router.post("/initiate", bookingRateLimiter, requireAuth, validateBody(initiateBookingSchema), bookingController.initiateBooking);
router.post("/:bookingId/payment-proof", bookingRateLimiter, requireAuth, upload.single("file"), bookingController.uploadPaymentProof);

// Razorpay callbacks are only exposed once the gateway is switched on.
if (env.paymentGatewayEnabled) {
  router.post("/verify-payment", validateBody(verifyPaymentSchema), bookingController.verifyPayment);
  router.post("/payment-failed", validateBody(paymentFailedSchema), bookingController.markPaymentFailed);
}

router.get("/me", requireAuth, bookingController.listMyBookings);
router.get("/me/:id", requireAuth, bookingController.getMyBookingById);
router.get("/:bookingId", bookingController.getBookingByBookingId);

export default router;
