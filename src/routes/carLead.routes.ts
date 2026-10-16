import { Router } from "express";
import { z } from "zod";
import * as carLeadController from "../controllers/carLead.controller";
import { validateBody } from "../middleware/validate";
import { authRateLimiter } from "../middleware/rateLimit";

const currentYear = new Date().getFullYear();

const carLeadSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  carMakeModel: z.string().trim().min(2, "Enter the car make and model").max(80),
  registrationNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$|^\d{2}BH\d{4}[A-Z]{1,2}$/, "Enter a valid registration number, e.g. UP16AB1234")),
  manufacturingYear: z.coerce
    .number()
    .int()
    .min(1990, "Enter a valid manufacturing year")
    .max(currentYear, "Enter a valid manufacturing year"),
  city: z.string().trim().min(2, "Enter your city").max(60),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
});

const router = Router();
router.post("/", authRateLimiter, validateBody(carLeadSchema), carLeadController.createCarLead);

export default router;
