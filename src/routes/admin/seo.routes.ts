import { Router } from "express";
import * as adminSeoController from "../../controllers/admin/seo.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.use(requirePermission("seo"));

router.get("/pages", adminSeoController.adminListPageSeo);
router.put("/pages", adminSeoController.adminUpdatePageSeo);

router.get("/redirects", adminSeoController.adminListRedirects);
router.post("/redirects", adminSeoController.adminCreateRedirect);
router.put("/redirects/:id", adminSeoController.adminUpdateRedirect);
router.delete("/redirects/:id", adminSeoController.adminDeleteRedirect);

export default router;
