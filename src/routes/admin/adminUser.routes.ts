import { Router } from "express";
import * as adminUserController from "../../controllers/admin/adminUser.controller";
import { requireRole } from "../../middleware/adminAuth";
import { AdminRole } from "../../types/enums";

const router = Router();
router.use(requireRole(AdminRole.SUPER_ADMIN));

router.get("/", adminUserController.adminListUsers);
router.post("/", adminUserController.adminCreateUser);
router.put("/:id", adminUserController.adminUpdateUser);
router.delete("/:id", adminUserController.adminDeleteUser);

export default router;
