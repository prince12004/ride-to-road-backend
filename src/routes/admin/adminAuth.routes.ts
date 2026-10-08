import { Router } from "express";
import * as adminAuthController from "../../controllers/adminAuth.controller";
import { validateBody } from "../../middleware/validate";
import { adminLoginSchema } from "../../validators/auth.validator";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { authRateLimiter } from "../../middleware/rateLimit";

const router = Router();

router.post("/login", authRateLimiter, validateBody(adminLoginSchema), adminAuthController.adminLogin);
router.post("/refresh", adminAuthController.adminRefresh);
router.post("/logout", requireAdminAuth, adminAuthController.adminLogout);
router.get("/me", requireAdminAuth, adminAuthController.getAdminMe);

export default router;
