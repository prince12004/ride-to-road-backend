import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";
import { verifyAdminAccessToken } from "../utils/jwt";
import { AdminRole, AdminPermissionModule } from "../types/enums";

export function requireAdminAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.adminAccessToken;
  if (!token) return next(new ApiError(401, "Admin authentication required."));

  try {
    req.admin = verifyAdminAccessToken(token);
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired admin session. Please login again."));
  }
}

export function requirePermission(...modules: AdminPermissionModule[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(new ApiError(401, "Admin authentication required."));
    if (req.admin.role === AdminRole.SUPER_ADMIN) return next();

    const hasPermission = modules.some((m) => req.admin!.permissions.includes(m));
    if (!hasPermission) return next(new ApiError(403, "You do not have permission to perform this action."));
    next();
  };
}

export function requireRole(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role as AdminRole)) {
      return next(new ApiError(403, "You do not have permission to perform this action."));
    }
    next();
  };
}
