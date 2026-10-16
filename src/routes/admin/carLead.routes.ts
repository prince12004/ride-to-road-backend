import { Router } from "express";
import { carLeadController } from "../../controllers/admin/carLead.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
// Car-owner leads are handled by the same team as contact enquiries.
router.use(requirePermission("contact"));

router.get("/", carLeadController.list);
router.get("/:id", carLeadController.getById);
router.put("/:id", carLeadController.update);
router.delete("/:id", carLeadController.remove);

export default router;
