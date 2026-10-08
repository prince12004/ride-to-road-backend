import { Router } from "express";
import * as adminCustomerController from "../../controllers/admin/customer.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.use(requirePermission("customers"));

router.get("/", adminCustomerController.adminListCustomers);
router.get("/verification-requests", adminCustomerController.adminListVerificationRequests);
router.get("/:id", adminCustomerController.adminGetCustomer);
router.patch("/:id/block-status", adminCustomerController.adminSetCustomerBlockStatus);
router.patch("/:id/verification", adminCustomerController.adminReviewVerification);

export default router;
