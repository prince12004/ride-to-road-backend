import { Router } from "express";
import * as adminBookingController from "../../controllers/admin/booking.controller";
import { requirePermission } from "../../middleware/adminAuth";
import { validateBody } from "../../middleware/validate";
import { offlineBookingSchema, extendBookingSchema } from "../../validators/booking.validator";

const router = Router();
router.use(requirePermission("bookings"));

router.get("/", adminBookingController.adminListBookings);
router.get("/pending-payments", adminBookingController.adminListPendingPayments);
router.post("/offline", validateBody(offlineBookingSchema), adminBookingController.adminCreateOfflineBooking);
router.get("/:id", adminBookingController.adminGetBooking);
router.patch("/:id/status", adminBookingController.adminUpdateBookingStatus);
router.patch("/:id/notes", adminBookingController.adminAddBookingNote);
router.post("/:id/extend", validateBody(extendBookingSchema), adminBookingController.adminExtendBooking);
router.post("/:id/cancel", adminBookingController.adminCancelBooking);

export default router;
