import { Router } from "express";
import * as adminLandingPageController from "../../controllers/admin/landingPage.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.use(requirePermission("seo"));

router.get("/", adminLandingPageController.adminListLandingPages);
router.post("/", adminLandingPageController.adminCreateLandingPage);
router.get("/:id", adminLandingPageController.adminGetLandingPage);
router.put("/:id", adminLandingPageController.adminUpdateLandingPage);
router.patch("/:id/status", adminLandingPageController.adminSetLandingPageStatus);
router.delete("/:id", adminLandingPageController.adminDeleteLandingPage);

export default router;
