import { Router } from "express";
import * as adminSeoController from "../../controllers/admin/seo.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.use(requirePermission("seo"));

router.get("/pages", adminSeoController.adminListPageSeo);
router.put("/pages", adminSeoController.adminUpdatePageSeo);

router.get("/settings", adminSeoController.adminGetSeoSettings);
router.put("/settings", adminSeoController.adminUpdateSeoSettings);

router.get("/cars", adminSeoController.adminListCarSeo);
router.put("/cars/:id", adminSeoController.adminUpdateCarSeo);

router.get("/redirects", adminSeoController.adminListRedirects);
router.post("/redirects", adminSeoController.adminCreateRedirect);
router.put("/redirects/:id", adminSeoController.adminUpdateRedirect);
router.delete("/redirects/:id", adminSeoController.adminDeleteRedirect);

export default router;
