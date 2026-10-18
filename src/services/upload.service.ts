import { randomUUID } from "crypto";
import cloudinary from "../config/cloudinary";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export interface UploadResult {
  url: string;
  publicId: string;
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type FileKind = "jpeg" | "png" | "webp" | "pdf";

/**
 * Identifies the file from its first bytes rather than trusting the
 * browser-supplied mimetype, so a renamed executable can't slip through.
 */
function sniffFileKind(buffer: Buffer): FileKind | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buffer.toString("ascii", 0, 5) === "%PDF-") return "pdf";
  return null;
}

export function isCloudinaryConfigured(): boolean {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  return Boolean(cloudName && apiKey && apiSecret);
}

function assertCloudinaryConfigured(): void {
  if (!isCloudinaryConfigured()) {
    console.error("[upload] Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
    throw new ApiError(503, "File uploads are temporarily unavailable. Please try again later or contact support.");
  }
}

export function validateImageFile(file: Express.Multer.File): void {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) throw new Error("Only JPG, PNG and WEBP images are allowed.");
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File size must be under 5MB.");
}

/** Validates an ID document or payment screenshot. Throws a 400 ApiError with a user-facing message. */
export function validateDocumentFile(file: Express.Multer.File, { allowPdf }: { allowPdf: boolean }): FileKind {
  if (file.size > MAX_FILE_SIZE_BYTES) throw new ApiError(400, "File size must be under 5MB.");
  const kind = sniffFileKind(file.buffer);
  if (!kind || (kind === "pdf" && !allowPdf)) {
    throw new ApiError(400, allowPdf ? "Only JPG, PNG, WEBP images or PDF files are allowed." : "Only JPG, PNG or WEBP images are allowed.");
  }
  return kind;
}

function toUploadError(error: unknown): ApiError {
  console.error("[upload] Cloudinary upload failed:", error);
  return new ApiError(502, "We couldn't upload your file right now. Please try again in a moment.");
}

export function uploadBufferToCloudinary(buffer: Buffer, folder: string): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    assertCloudinaryConfigured();
    const stream = cloudinary.uploader.upload_stream(
      { folder: `ride-to-road/${folder}`, resource_type: "image" },
      (error, result) => {
        if (error || !result) return reject(toUploadError(error));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Uploads a sensitive file (KYC document, payment screenshot) as an
 * "authenticated" Cloudinary asset: it can only be opened through the signed
 * URL returned here, never through a plain/guessed public URL.
 */
export function uploadPrivateFile(buffer: Buffer, folder: string, kind: FileKind): Promise<UploadResult> {
  const isPdf = kind === "pdf";
  const resourceType = isPdf ? "raw" : "image";

  return new Promise((resolve, reject) => {
    assertCloudinaryConfigured();
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `ride-to-road/${folder}`,
        resource_type: resourceType,
        type: "authenticated",
        // Raw assets keep their extension in the public id, so PDFs open as PDFs.
        ...(isPdf ? { public_id: `${randomUUID()}.pdf` } : {}),
      },
      (error, result) => {
        if (error || !result) return reject(toUploadError(error));
        const url = isPdf
          ? pdfDownloadUrl(result.public_id)
          : cloudinary.url(result.public_id, {
              resource_type: resourceType,
              type: "authenticated",
              sign_url: true,
              secure: true,
              format: result.format,
            });
        resolve({ url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

const PDF_LINK_TTL_SECONDS = 60 * 60;

/**
 * Cloudinary blocks direct delivery of PDFs on standard accounts, so PDFs are
 * opened through a short-lived, API-signed download link instead. It expires,
 * so it is regenerated every time the document is read (see viewableDocumentUrl).
 */
function pdfDownloadUrl(publicId: string): string {
  return cloudinary.utils.private_download_url(publicId, "", {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + PDF_LINK_TTL_SECONDS,
  });
}

/** Returns a link that opens the stored private file right now. */
export function viewableDocumentUrl(doc: { url: string; publicId: string }): string {
  if (doc.publicId?.endsWith(".pdf") && isCloudinaryConfigured()) return pdfDownloadUrl(doc.publicId);
  return doc.url;
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

/** Removes a file uploaded with uploadPrivateFile. Best effort: a failure is only logged. */
export async function deletePrivateFile(publicId: string): Promise<void> {
  if (!publicId || !isCloudinaryConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId, {
      type: "authenticated",
      resource_type: publicId.endsWith(".pdf") ? "raw" : "image",
      invalidate: true,
    });
  } catch (error) {
    console.error("[upload] Could not delete private file:", publicId, error);
  }
}
