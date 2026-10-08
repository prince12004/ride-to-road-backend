import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();
router.use(requireAuth);

router.get("/dashboard-summary", userController.getDashboardSummary);
router.put("/profile", userController.updateProfile);
router.get("/bookings", userController.listMyBookingHistory);
router.post("/verification", userController.submitVerification);
router.post("/verification/upload", upload.single("file"), userController.uploadMyDocumentFile);

export default router;
