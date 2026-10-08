import { Router } from "express";
import * as dashboardController from "../../controllers/admin/dashboard.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.get("/stats", requirePermission("dashboard"), dashboardController.adminGetDashboardStats);

export default router;
