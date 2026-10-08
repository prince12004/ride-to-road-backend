import { Router } from "express";
import { contactEnquiryController } from "../../controllers/admin/contactEnquiry.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.use(requirePermission("contact"));

router.get("/", contactEnquiryController.list);
router.get("/:id", contactEnquiryController.getById);
router.put("/:id", contactEnquiryController.update);
router.delete("/:id", contactEnquiryController.remove);

export default router;
