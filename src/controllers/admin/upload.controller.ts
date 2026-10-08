import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { validateImageFile, uploadBufferToCloudinary, deleteFromCloudinary } from "../../services/upload.service";

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "No file was uploaded.");

  try {
    validateImageFile(file);
  } catch (err) {
    throw new ApiError(400, (err as Error).message);
  }

  const folder = (req.body.folder as string) || "misc";
  const result = await uploadBufferToCloudinary(file.buffer, folder);
  res.status(201).json({ success: true, data: result });
});

export const deleteImage = asyncHandler(async (req: Request, res: Response) => {
  const { publicId } = req.body as { publicId: string };
  if (!publicId) throw new ApiError(400, "publicId is required.");
  await deleteFromCloudinary(publicId);
  res.json({ success: true, message: "Image deleted." });
});
