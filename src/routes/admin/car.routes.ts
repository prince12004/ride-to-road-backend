import { Router } from "express";
import * as adminCarController from "../../controllers/admin/car.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.use(requirePermission("cars"));

router.get("/", adminCarController.adminListCars);
router.post("/", adminCarController.adminCreateCar);
router.get("/:id", adminCarController.adminGetCar);
router.put("/:id", adminCarController.adminUpdateCar);
router.delete("/:id", adminCarController.adminDeleteCar);
router.post("/:id/duplicate", adminCarController.adminDuplicateCar);
router.patch("/:id/status", adminCarController.adminUpdateCarStatus);
router.patch("/:id/featured", adminCarController.adminToggleFeatured);

export default router;
