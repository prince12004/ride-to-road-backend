import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface UserTokenPayload {
  id: string;
  role: "USER";
}

export interface AdminTokenPayload {
  id: string;
  role: string;
  permissions: string[];
}

export function signUserAccessToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: "15m" } as SignOptions);
}
export function signUserRefreshToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: "30d" } as SignOptions);
}
export function verifyUserAccessToken(token: string): UserTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as UserTokenPayload;
}
export function verifyUserRefreshToken(token: string): UserTokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as UserTokenPayload;
}

export function signAdminAccessToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, env.adminJwtAccessSecret, { expiresIn: "30m" } as SignOptions);
}
export function signAdminRefreshToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, env.adminJwtRefreshSecret, { expiresIn: "7d" } as SignOptions);
}
export function verifyAdminAccessToken(token: string): AdminTokenPayload {
  return jwt.verify(token, env.adminJwtAccessSecret) as AdminTokenPayload;
}
export function verifyAdminRefreshToken(token: string): AdminTokenPayload {
  return jwt.verify(token, env.adminJwtRefreshSecret) as AdminTokenPayload;
}
