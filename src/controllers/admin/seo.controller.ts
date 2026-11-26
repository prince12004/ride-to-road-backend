import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { PageSeo, STATIC_SEO_PAGES, STATIC_SEO_PATHS } from "../../models/PageSeo";
import { Redirect } from "../../models/Redirect";
import { logActivity } from "../../services/activityLog.service";
import { assertNoLoop, assertRedirectable, normalizePath, normalizeTarget } from "../../services/redirect.service";

/** Every static page, merged with whatever SEO overrides have been saved for it. */
export const adminListPageSeo = asyncHandler(async (_req: Request, res: Response) => {
  const saved = await PageSeo.find().lean();
  const byPath = new Map(saved.map((p) => [p.path, p]));
  const data = STATIC_SEO_PAGES.map(({ path, label }) => ({
    path,
    label,
    noindex: false,
    nofollow: false,
    includeInSitemap: true,
    ...(byPath.get(path) ?? {}),
  }));
  res.json({ success: true, data });
});

export const adminUpdatePageSeo = asyncHandler(async (req: Request, res: Response) => {
  const path = String(req.body.path ?? "");
  if (!STATIC_SEO_PATHS.includes(path)) throw new ApiError(400, "Unknown page.");

  const { metaTitle, metaDescription, canonicalUrl, ogImage, noindex, nofollow, includeInSitemap } = req.body;
  const page = await PageSeo.findOneAndUpdate(
    { path },
    {
      path,
      // Empty strings / null (not undefined) so clearing a field actually clears it.
      metaTitle: String(metaTitle ?? "").trim(),
      metaDescription: String(metaDescription ?? "").trim(),
      canonicalUrl: String(canonicalUrl ?? "").trim(),
      ogImage: ogImage?.url ? { url: ogImage.url, publicId: ogImage.publicId } : null,
      noindex: Boolean(noindex),
      nofollow: Boolean(nofollow),
      includeInSitemap: includeInSitemap !== false,
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await logActivity(req, { action: "page_seo_updated", module: "seo", recordId: path });
  res.json({ success: true, data: page });
});

export const adminListRedirects = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as Record<string, string>;
  const query = search
    ? { $or: [{ from: { $regex: escapeRegex(search), $options: "i" } }, { to: { $regex: escapeRegex(search), $options: "i" } }] }
    : {};
  const data = await Redirect.find(query).sort("-updatedAt").limit(500);
  res.json({ success: true, data });
});

async function buildRedirectPayload(body: Record<string, unknown>, ignoreId?: string) {
  if (!String(body.from ?? "").trim()) throw new ApiError(400, "Enter the old path.");
  if (!String(body.to ?? "").trim()) throw new ApiError(400, "Enter where it should redirect to.");
  const from = normalizePath(String(body.from));
  const to = normalizeTarget(String(body.to));
  assertRedirectable(from);

  const statusCode = Number(body.statusCode ?? 301);
  if (statusCode !== 301 && statusCode !== 302) throw new ApiError(400, "Status code must be 301 or 302.");
  const isActive = body.isActive !== false;
  if (isActive) await assertNoLoop(from, to, ignoreId);

  return { from, to, statusCode, isActive, note: typeof body.note === "string" ? body.note : undefined };
}

export const adminCreateRedirect = asyncHandler(async (req: Request, res: Response) => {
  const payload = await buildRedirectPayload(req.body);
  if (await Redirect.exists({ from: payload.from })) throw new ApiError(409, `A redirect from ${payload.from} already exists.`);
  const redirect = await Redirect.create(payload);
  await logActivity(req, { action: "redirect_created", module: "seo", recordId: String(redirect._id), meta: { from: redirect.from, to: redirect.to } });
  res.status(201).json({ success: true, data: redirect });
});

export const adminUpdateRedirect = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(404, "Redirect not found.");
  const payload = await buildRedirectPayload(req.body, req.params.id);
  if (await Redirect.exists({ from: payload.from, _id: { $ne: req.params.id } })) {
    throw new ApiError(409, `A redirect from ${payload.from} already exists.`);
  }
  const redirect = await Redirect.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!redirect) throw new ApiError(404, "Redirect not found.");
  await logActivity(req, { action: "redirect_updated", module: "seo", recordId: String(redirect._id), meta: { from: redirect.from, to: redirect.to } });
  res.json({ success: true, data: redirect });
});

export const adminDeleteRedirect = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(404, "Redirect not found.");
  const redirect = await Redirect.findByIdAndDelete(req.params.id);
  if (!redirect) throw new ApiError(404, "Redirect not found.");
  await logActivity(req, { action: "redirect_deleted", module: "seo", recordId: String(redirect._id), meta: { from: redirect.from } });
  res.json({ success: true, message: "Redirect deleted." });
});

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
