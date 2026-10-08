import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ContactEnquiry } from "../models/ContactEnquiry";

export const createContactEnquiry = asyncHandler(async (req: Request, res: Response) => {
  const { name, mobile, email, message } = req.body;
  const enquiry = await ContactEnquiry.create({ name, mobile, email, message });
  res.status(201).json({ success: true, message: "Thank you for reaching out. Our team will contact you shortly.", data: enquiry });
});
