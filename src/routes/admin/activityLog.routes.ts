import { Router } from "express";
import * as activityLogController from "../../controllers/admin/activityLog.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.get("/", requirePermission("activityLogs"), activityLogController.adminListActivityLogs);

export default router;
