import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { Setting } from "../../models/Setting";
import { SiteContent, SiteContentKey, SITE_CONTENT_KEYS } from "../../models/SiteContent";
import { logActivity } from "../../services/activityLog.service";

export const adminGetSettings = asyncHandler(async (_req: Request, res: Response) => {
  let settings = await Setting.findOne({ key: "GLOBAL" });
  if (!settings) settings = await Setting.create({ key: "GLOBAL" });
  res.json({ success: true, data: settings });
});

export const adminUpdateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await Setting.findOneAndUpdate({ key: "GLOBAL" }, req.body, { new: true, upsert: true, runValidators: true });
  await logActivity(req, { action: "settings_updated", module: "settings" });
  res.json({ success: true, data: settings });
});

export const adminListSiteContent = asyncHandler(async (_req: Request, res: Response) => {
  const pages = await SiteContent.find().sort("key");
  res.json({ success: true, data: pages });
});

export const adminGetSiteContent = asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key as SiteContentKey;
  if (!SITE_CONTENT_KEYS.includes(key)) throw new ApiError(400, "Invalid content page key.");
  const content = await SiteContent.findOne({ key });
  if (!content) throw new ApiError(404, "Page not found.");
  res.json({ success: true, data: content });
});

export const adminUpdateSiteContent = asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key as SiteContentKey;
  if (!SITE_CONTENT_KEYS.includes(key)) throw new ApiError(400, "Invalid content page key.");

  const { title, content } = req.body;
  const page = await SiteContent.findOneAndUpdate({ key }, { title, content }, { new: true, upsert: true, runValidators: true });
  await logActivity(req, { action: "site_content_updated", module: "cms", recordId: key });
  res.json({ success: true, data: page });
});
