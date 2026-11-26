import { Router } from "express";
import * as seoController from "../controllers/seo.controller";

const router = Router();
router.get("/pages", seoController.listPageSeo);
router.get("/redirects", seoController.listActiveRedirects);
router.get("/sitemap", seoController.getSitemapEntries);

export default router;
