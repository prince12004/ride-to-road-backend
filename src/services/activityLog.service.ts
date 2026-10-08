import { Request } from "express";
import { ActivityLog } from "../models/ActivityLog";

export async function logActivity(
  req: Request,
  params: { action: string; module: string; recordId?: string; meta?: Record<string, unknown> }
): Promise<void> {
  if (!req.admin?.id) return;
  await ActivityLog.create({
    admin: req.admin.id,
    action: params.action,
    module: params.module,
    recordId: params.recordId,
    meta: params.meta,
    ip: req.ip,
  });
}
