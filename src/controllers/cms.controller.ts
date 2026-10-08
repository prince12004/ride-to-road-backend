import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Setting } from "../models/Setting";
import { SiteContent, SiteContentKey } from "../models/SiteContent";

export const getPublicSettings = asyncHandler(async (_req: Request, res: Response) => {
  let settings = await Setting.findOne({ key: "GLOBAL" });
  if (!settings) settings = await Setting.create({ key: "GLOBAL" });
  res.json({ success: true, data: settings });
});

export const getSiteContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await SiteContent.findOne({ key: req.params.key as SiteContentKey });
  if (!content) throw new ApiError(404, "Page not found.");
  res.json({ success: true, data: content });
});
