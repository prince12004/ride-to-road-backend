import { Router } from "express";
import * as cmsController from "../controllers/cms.controller";

const router = Router();
router.get("/settings", cmsController.getPublicSettings);
router.get("/site-content/:key", cmsController.getSiteContent);

export default router;
