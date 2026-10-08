import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { AdminUser } from "../models/AdminUser";
import { signAdminAccessToken, signAdminRefreshToken, verifyAdminRefreshToken } from "../utils/jwt";
import { setAdminAuthCookies, clearAdminAuthCookies } from "../utils/cookies";

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const admin = await AdminUser.findOne({ email }).select("+password +refreshTokens");
  if (!admin || !admin.isActive || !(await admin.comparePassword(password))) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const accessToken = signAdminAccessToken({ id: String(admin._id), role: admin.role, permissions: admin.permissions });
  const refreshToken = signAdminRefreshToken({ id: String(admin._id), role: admin.role, permissions: admin.permissions });

  admin.refreshTokens = [...(admin.refreshTokens ?? []).slice(-4), refreshToken];
  admin.lastLoginAt = new Date();
  await admin.save();

  setAdminAuthCookies(res, accessToken, refreshToken);
  res.json({
    success: true,
    data: {
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, permissions: admin.permissions },
      accessToken,
    },
  });
});

export const adminRefresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.adminRefreshToken;
  if (!token) throw new ApiError(401, "No refresh token provided.");

  let payload;
  try {
    payload = verifyAdminRefreshToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token.");
  }

  const admin = await AdminUser.findById(payload.id).select("+refreshTokens");
  if (!admin || !admin.refreshTokens.includes(token)) throw new ApiError(401, "Refresh token is no longer valid.");

  const accessToken = signAdminAccessToken({ id: String(admin._id), role: admin.role, permissions: admin.permissions });
  const newRefreshToken = signAdminRefreshToken({ id: String(admin._id), role: admin.role, permissions: admin.permissions });
  admin.refreshTokens = [...admin.refreshTokens.filter((t) => t !== token), newRefreshToken];
  await admin.save();

  setAdminAuthCookies(res, accessToken, newRefreshToken);
  res.json({ success: true, data: { accessToken } });
});

export const adminLogout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.adminRefreshToken;
  if (token && req.admin) await AdminUser.findByIdAndUpdate(req.admin.id, { $pull: { refreshTokens: token } });
  clearAdminAuthCookies(res);
  res.json({ success: true, message: "Logged out successfully." });
});

export const getAdminMe = asyncHandler(async (req: Request, res: Response) => {
  const admin = await AdminUser.findById(req.admin!.id);
  if (!admin) throw new ApiError(404, "Admin not found.");
  res.json({ success: true, data: admin });
});
