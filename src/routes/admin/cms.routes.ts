import { Router } from "express";
import * as adminCmsController from "../../controllers/admin/cms.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();

router.get("/settings", requirePermission("settings"), adminCmsController.adminGetSettings);
router.put("/settings", requirePermission("settings"), adminCmsController.adminUpdateSettings);

router.get("/site-content", requirePermission("cms"), adminCmsController.adminListSiteContent);
router.get("/site-content/:key", requirePermission("cms"), adminCmsController.adminGetSiteContent);
router.put("/site-content/:key", requirePermission("cms"), adminCmsController.adminUpdateSiteContent);

export default router;
