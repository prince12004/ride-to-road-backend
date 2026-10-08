import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ActivityLog } from "../../models/ActivityLog";

export const adminListActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const { module, admin, page = "1", limit = "50" } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {};
  if (module) query.module = module;
  if (admin) query.admin = admin;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [logs, total] = await Promise.all([
    ActivityLog.find(query).populate("admin", "name email role").sort("-createdAt").skip((pageNum - 1) * limitNum).limit(limitNum),
    ActivityLog.countDocuments(query),
  ]);

  res.json({ success: true, data: logs, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
});
