import { Router } from "express";
import { z } from "zod";
import * as contactController from "../controllers/contact.controller";
import { validateBody } from "../middleware/validate";
import { authRateLimiter } from "../middleware/rateLimit";

const contactSchema = z.object({
  name: z.string().min(2),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().min(5),
});

const router = Router();
router.post("/", authRateLimiter, validateBody(contactSchema), contactController.createContactEnquiry);

export default router;
