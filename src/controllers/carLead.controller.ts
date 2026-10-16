import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { CarLead } from "../models/CarLead";
import { Setting } from "../models/Setting";
import { generateGenericWhatsAppUrl } from "../services/whatsapp.service";

export const createCarLead = asyncHandler(async (req: Request, res: Response) => {
  const { name, mobile, carMakeModel, registrationNumber, manufacturingYear, city, details } = req.body;

  const lead = await CarLead.create({
    name,
    mobile,
    carMakeModel,
    registrationNumber,
    manufacturingYear,
    city,
    details: details || undefined,
  });

  // No WhatsApp Business API is connected, so the lead reaches our WhatsApp
  // through a prefilled wa.me link the customer sends from their phone.
  const message = [
    "Hi Ride to Road, I'd like to attach my car to your platform.",
    "",
    `Name: ${lead.name}`,
    `Mobile: +91 ${lead.mobile}`,
    `Car: ${lead.carMakeModel}`,
    `Registration No: ${lead.registrationNumber}`,
    `Manufacturing Year: ${lead.manufacturingYear}`,
    `City: ${lead.city}`,
    ...(lead.details ? [`Details: ${lead.details}`] : []),
  ].join("\n");

  const settings = await Setting.findOne({ key: "GLOBAL" }).select("whatsappNumber").lean();
  const whatsappUrl = generateGenericWhatsAppUrl(message, settings?.whatsappNumber || undefined);

  res.status(201).json({
    success: true,
    message: "Thanks! Your car details have been received. Our team will contact you shortly.",
    data: { id: lead._id, whatsappUrl },
  });
});
