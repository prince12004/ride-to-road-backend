import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { AdminUser } from "../../models/AdminUser";
import { logActivity } from "../../services/activityLog.service";

export const adminListUsers = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await AdminUser.find().sort("-createdAt");
  res.json({ success: true, data: admins });
});

export const adminCreateUser = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role, permissions } = req.body;
  const existing = await AdminUser.findOne({ email });
  if (existing) throw new ApiError(409, "An admin with this email already exists.");

  const admin = await AdminUser.create({ name, email, password, role, permissions });
  await logActivity(req, { action: "admin_user_created", module: "users", recordId: String(admin._id) });
  res.status(201).json({ success: true, data: admin });
});

export const adminUpdateUser = asyncHandler(async (req: Request, res: Response) => {
  const { password, ...rest } = req.body;
  const admin = await AdminUser.findById(req.params.id);
  if (!admin) throw new ApiError(404, "Admin not found.");

  Object.assign(admin, rest);
  if (password) admin.password = password;
  await admin.save();

  await logActivity(req, { action: "admin_user_updated", module: "users", recordId: String(admin._id) });
  res.json({ success: true, data: admin });
});

export const adminDeleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (req.params.id === req.admin!.id) throw new ApiError(400, "You cannot delete your own account.");
  const admin = await AdminUser.findByIdAndDelete(req.params.id);
  if (!admin) throw new ApiError(404, "Admin not found.");
  await logActivity(req, { action: "admin_user_deleted", module: "users", recordId: String(admin._id) });
  res.json({ success: true, message: "Admin user deleted." });
});
