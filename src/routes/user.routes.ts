import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validateBody } from "../middleware/validate";
import { documentNumbersSchema } from "../validators/booking.validator";

const router = Router();
router.use(requireAuth);

router.get("/dashboard-summary", userController.getDashboardSummary);
router.put("/profile", userController.updateProfile);
router.post("/profile/image", upload.single("file"), userController.uploadProfileImage);
router.delete("/profile/image", userController.removeProfileImage);
router.get("/bookings", userController.listMyBookingHistory);
router.post("/verification", userController.submitVerification);
router.put("/verification/numbers", validateBody(documentNumbersSchema), userController.updateDocumentNumbers);
router.post("/verification/upload", upload.single("file"), userController.uploadMyDocumentFile);

export default router;
