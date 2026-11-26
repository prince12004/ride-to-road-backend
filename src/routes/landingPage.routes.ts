import { Router } from "express";
import * as landingPageController from "../controllers/landingPage.controller";

const router = Router();
router.get("/footer", landingPageController.listFooterLandingPages);
router.get("/:slug", landingPageController.getLandingPageBySlug);

export default router;
