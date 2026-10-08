import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { User } from "../models/User";
import { signUserAccessToken, signUserRefreshToken, verifyUserRefreshToken } from "../utils/jwt";
import { setUserAuthCookies, clearUserAuthCookies } from "../utils/cookies";
import { generateOtp, hashOtp, getOtpExpiry, getResendCooldownRemainingMs, sendOtpSms, MAX_OTP_ATTEMPTS } from "../services/otp.service";

export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body;

  let user = await User.findOne({ mobile }).select("+otpRequestedAt");
  const cooldown = getResendCooldownRemainingMs(user?.otpRequestedAt);
  if (cooldown > 0) {
    throw new ApiError(429, `Please wait ${Math.ceil(cooldown / 1000)}s before requesting another OTP.`);
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const otpExpires = getOtpExpiry();

  if (!user) {
    user = await User.create({ mobile, otpHash, otpExpires, otpAttempts: 0, otpRequestedAt: new Date() });
  } else {
    user.otpHash = otpHash;
    user.otpExpires = otpExpires;
    user.otpAttempts = 0;
    user.otpRequestedAt = new Date();
    await user.save();
  }

  const { devOtp } = await sendOtpSms(mobile, otp);

  res.json({
    success: true,
    message: "OTP sent successfully.",
    data: {
      isNewUser: !user.name,
      ...(devOtp ? { devOtp } : {}),
    },
  });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, otp, name } = req.body;

  const user = await User.findOne({ mobile }).select("+otpHash +otpExpires +otpAttempts +refreshTokens");
  if (!user || !user.otpHash || !user.otpExpires) {
    throw new ApiError(400, "Please request a new OTP.");
  }
  if (user.isBlocked) throw new ApiError(403, "Your account has been blocked. Please contact support.");

  if (user.otpExpires < new Date()) throw new ApiError(400, "OTP has expired. Please request a new one.");
  if (user.otpAttempts >= MAX_OTP_ATTEMPTS) throw new ApiError(429, "Too many incorrect attempts. Please request a new OTP.");

  if (user.otpHash !== hashOtp(otp)) {
    user.otpAttempts += 1;
    await user.save();
    throw new ApiError(400, "Incorrect OTP.");
  }

  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  user.isVerifiedMobile = true;
  if (name && !user.name) user.name = name;

  const accessToken = signUserAccessToken({ id: String(user._id), role: "USER" });
  const refreshToken = signUserRefreshToken({ id: String(user._id), role: "USER" });
  user.refreshTokens = [...(user.refreshTokens ?? []).slice(-4), refreshToken];
  await user.save();

  setUserAuthCookies(res, accessToken, refreshToken);

  res.json({
    success: true,
    data: {
      user: { id: user._id, name: user.name, mobile: user.mobile, email: user.email },
      accessToken,
    },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
  if (!token) throw new ApiError(401, "No refresh token provided.");

  let payload;
  try {
    payload = verifyUserRefreshToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token.");
  }

  const user = await User.findById(payload.id).select("+refreshTokens");
  if (!user || !user.refreshTokens.includes(token)) throw new ApiError(401, "Refresh token is no longer valid.");

  const accessToken = signUserAccessToken({ id: String(user._id), role: "USER" });
  const newRefreshToken = signUserRefreshToken({ id: String(user._id), role: "USER" });
  user.refreshTokens = [...user.refreshTokens.filter((t) => t !== token), newRefreshToken];
  await user.save();

  setUserAuthCookies(res, accessToken, newRefreshToken);
  res.json({ success: true, data: { accessToken } });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (token && req.user) await User.findByIdAndUpdate(req.user.id, { $pull: { refreshTokens: token } });
  clearUserAuthCookies(res);
  res.json({ success: true, message: "Logged out successfully." });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, "User not found.");
  res.json({ success: true, data: user });
});
