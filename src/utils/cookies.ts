import { Response } from "express";
import { env } from "../config/env";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function setUserAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const base = { httpOnly: true, secure: env.isProd, sameSite: "lax" as const };
  res.cookie("accessToken", accessToken, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie("refreshToken", refreshToken, { ...base, maxAge: THIRTY_DAYS_MS });
}
export function clearUserAuthCookies(res: Response) {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
}
export function setAdminAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const base = { httpOnly: true, secure: env.isProd, sameSite: "lax" as const };
  res.cookie("adminAccessToken", accessToken, { ...base, maxAge: 30 * 60 * 1000 });
  res.cookie("adminRefreshToken", refreshToken, { ...base, maxAge: SEVEN_DAYS_MS });
}
export function clearAdminAuthCookies(res: Response) {
  res.clearCookie("adminAccessToken");
  res.clearCookie("adminRefreshToken");
}
