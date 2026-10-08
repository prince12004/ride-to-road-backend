import { Router } from "express";
import * as bookingController from "../controllers/booking.controller";
import { validateBody } from "../middleware/validate";
import { initiateBookingSchema, verifyPaymentSchema, paymentFailedSchema } from "../validators/booking.validator";
import { requireAuth } from "../middleware/auth";
import { bookingRateLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/initiate", bookingRateLimiter, requireAuth, validateBody(initiateBookingSchema), bookingController.initiateBooking);
router.post("/verify-payment", validateBody(verifyPaymentSchema), bookingController.verifyPayment);
router.post("/payment-failed", validateBody(paymentFailedSchema), bookingController.markPaymentFailed);
router.get("/me", requireAuth, bookingController.listMyBookings);
router.get("/me/:id", requireAuth, bookingController.getMyBookingById);
router.get("/:bookingId", bookingController.getBookingByBookingId);

export default router;
