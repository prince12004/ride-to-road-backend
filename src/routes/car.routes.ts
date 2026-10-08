import { Router } from "express";
import * as carController from "../controllers/car.controller";

const router = Router();

router.get("/", carController.listCars);
router.get("/:id/availability", carController.checkCarAvailability);
router.get("/:slug", carController.getCarBySlug);

export default router;
