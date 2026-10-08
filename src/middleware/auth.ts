import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";
import { verifyUserAccessToken } from "../utils/jwt";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.accessToken;
  if (!token) return next(new ApiError(401, "Authentication required."));

  try {
    req.user = verifyUserAccessToken(token);
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired session. Please login again."));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.accessToken;
  if (token) {
    try {
      req.user = verifyUserAccessToken(token);
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
