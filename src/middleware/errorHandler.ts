import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
  }

  const isMongoDuplicate = typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
  if (isMongoDuplicate) {
    return res.status(409).json({ success: false, message: "A record with these details already exists." });
  }

  const isValidationError = typeof err === "object" && err !== null && (err as { name?: string }).name === "ValidationError";
  if (isValidationError) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }

  console.error(err);
  res.status(500).json({
    success: false,
    message: "Something went wrong on our end. Please try again.",
    stack: env.isProd ? undefined : (err as Error)?.stack,
  });
}
