import { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
  }

  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File size must be under 5MB."
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Please upload one file at a time."
          : "The file could not be uploaded. Please try again.";
    return res.status(400).json({ success: false, message });
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
