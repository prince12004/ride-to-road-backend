import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { PageSeo, STATIC_SEO_PAGES, STATIC_SEO_PATHS } from "../../models/PageSeo";
import { Redirect } from "../../models/Redirect";
import { Setting } from "../../models/Setting";
import { Car } from "../../models/Car";
import { CarStatus } from "../../types/enums";
import slugify from "slugify";
import { logActivity } from "../../services/activityLog.service";
import { assertNoLoop, assertRedirectable, normalizePath, normalizeTarget, recordSlugChange } from "../../services/redirect.service";
import { normalizeCustomSchema } from "../../utils/customSchema";

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

  const { metaTitle, metaDescription, canonicalUrl, ogImage, noindex, nofollow, includeInSitemap, customSchema } = req.body;
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
      customSchema: normalizeCustomSchema(customSchema),
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

// ---------------------------------------------------------------------------
// Site-wide SEO settings (defaults + business schema). Only touches `seo`, so
// an SEO manager doesn't need the general "settings" permission.
// ---------------------------------------------------------------------------

const optionalNumber = (v: unknown) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v));

export const adminGetSeoSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await Setting.findOne({ key: "GLOBAL" }).select("seo companyName phone email address socialLinks logo").lean();
  res.json({ success: true, data: settings });
});

export const adminUpdateSeoSettings = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const latitude = optionalNumber(b.latitude);
  const longitude = optionalNumber(b.longitude);
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) throw new ApiError(400, "Latitude must be between -90 and 90.");
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) throw new ApiError(400, "Longitude must be between -180 and 180.");

  const set: Record<string, unknown> = {
    "seo.defaultSeoTitle": str(b.defaultSeoTitle),
    "seo.defaultDescription": str(b.defaultDescription),
    "seo.defaultOgImage": b.defaultOgImage?.url ? { url: str(b.defaultOgImage.url), publicId: str(b.defaultOgImage.publicId) } : null,
    "seo.businessType": str(b.businessType) || "AutoRental",
    "seo.priceRange": str(b.priceRange),
    "seo.openingHours": str(b.openingHours),
    "seo.areaServed": (Array.isArray(b.areaServed) ? b.areaServed : []).map(str).filter(Boolean),
  };
  const unset: Record<string, 1> = {};
  for (const [key, val] of [["seo.latitude", latitude], ["seo.longitude", longitude]] as const) {
    if (val === undefined) unset[key] = 1;
    else set[key] = val;
  }
  const settings = await Setting.findOneAndUpdate(
    { key: "GLOBAL" },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true, upsert: true, runValidators: true }
  ).select("seo");
  await logActivity(req, { action: "seo_settings_updated", module: "seo" });
  res.json({ success: true, data: settings });
});

// ---------------------------------------------------------------------------
// Car SEO: slug, meta, indexing, schema and image alt text — without access
// to prices, documents or other car data.
// ---------------------------------------------------------------------------

export const adminListCarSeo = asyncHandler(async (_req: Request, res: Response) => {
  const data = await Car.find().select("name brand slug status seo mainImage gallery").sort("name").lean();
  res.json({ success: true, data });
});

export const adminUpdateCarSeo = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(404, "Car not found.");
  const car = await Car.findById(req.params.id);
  if (!car) throw new ApiError(404, "Car not found.");
  const b = req.body ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const oldSlug = car.slug;
  const slug = slugify(str(b.slug), { lower: true, strict: true });
  if (slug && slug !== oldSlug) {
    if (await Car.exists({ slug, _id: { $ne: car._id } })) throw new ApiError(409, "Another car already uses this URL slug.");
    car.slug = slug;
  }

  const s = b.seo ?? {};
  car.seo = {
    seoTitle: str(s.seoTitle),
    metaDescription: str(s.metaDescription),
    ogImage: s.ogImage?.url ? { url: str(s.ogImage.url), publicId: str(s.ogImage.publicId) } : undefined,
    canonicalUrl: str(s.canonicalUrl),
    noindex: Boolean(s.noindex),
    nofollow: Boolean(s.nofollow),
    includeInSitemap: s.includeInSitemap !== false,
    customSchema: normalizeCustomSchema(s.customSchema),
  };

  // Alt text only: images themselves are managed in the full car editor.
  if (typeof b.mainImageAlt === "string" && car.mainImage) car.mainImage.alt = str(b.mainImageAlt);
  if (Array.isArray(b.galleryAlts)) {
    car.gallery.forEach((img, i) => {
      if (typeof b.galleryAlts[i] === "string") img.alt = str(b.galleryAlts[i]);
    });
  }

  await car.save();
  if (car.slug !== oldSlug && car.status !== CarStatus.INACTIVE) await recordSlugChange("/cars", oldSlug, car.slug);
  await logActivity(req, { action: "car_seo_updated", module: "seo", recordId: String(car._id) });
  res.json({ success: true, data: car });
});
