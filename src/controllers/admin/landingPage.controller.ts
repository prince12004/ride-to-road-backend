import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import slugify from "slugify";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { sanitizeContent } from "../../utils/sanitizeContent";
import { LandingPage, LANDING_CARS_MODES, LANDING_PAGE_TYPES, RESERVED_LANDING_SLUGS } from "../../models/LandingPage";
import { ContentStatus } from "../../types/enums";
import { logActivity } from "../../services/activityLog.service";
import { recordSlugChange } from "../../services/redirect.service";
import { Redirect } from "../../models/Redirect";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Whitelists and cleans the editable fields; throws on invalid input. */
function buildPayload(body: Record<string, any>) {
  const title = str(body.title);
  const h1 = str(body.h1);
  if (!title) throw new ApiError(400, "Page name is required.");
  if (!h1) throw new ApiError(400, "H1 heading is required.");

  const slug = slugify(str(body.slug) || h1, { lower: true, strict: true });
  if (!slug) throw new ApiError(400, "URL slug is required.");
  if (RESERVED_LANDING_SLUGS.has(slug)) throw new ApiError(400, `"/${slug}" is already used by the website. Choose another slug.`);

  const pageType = LANDING_PAGE_TYPES.includes(body.pageType) ? body.pageType : "location";
  const carsMode = LANDING_CARS_MODES.includes(body.carsMode) ? body.carsMode : "none";
  const location = isValidObjectId(body.location) ? body.location : null;
  if (carsMode === "location" && !location) throw new ApiError(400, "Choose a location to list its cars, or change the cars setting.");

  const image = (img: any) => (img?.url ? { url: str(img.url), publicId: str(img.publicId), alt: str(img.alt) } : null);

  return {
    title,
    slug,
    pageType,
    h1,
    intro: str(body.intro),
    heroImage: image(body.heroImage),
    content: sanitizeContent(typeof body.content === "string" ? body.content : ""),
    faqs: (Array.isArray(body.faqs) ? body.faqs : [])
      .map((f: any) => ({ question: str(f?.question), answer: str(f?.answer) }))
      .filter((f: { question: string; answer: string }) => f.question && f.answer),
    location,
    carsMode,
    carsHeading: str(body.carsHeading),
    cars: (Array.isArray(body.cars) ? body.cars : []).filter((id: unknown) => isValidObjectId(id)),
    showInFooter: Boolean(body.showInFooter),
    metaTitle: str(body.metaTitle),
    metaDescription: str(body.metaDescription),
    ogImage: image(body.ogImage),
    canonicalUrl: str(body.canonicalUrl),
    noindex: Boolean(body.noindex),
    nofollow: Boolean(body.nofollow),
    includeInSitemap: body.includeInSitemap !== false,
  };
}

/** `currentSlug`: a redirect pointing at this page (from an earlier rename) is not a conflict. */
async function assertSlugFree(slug: string, ignoreId?: string, currentSlug?: string) {
  if (await LandingPage.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) })) {
    throw new ApiError(409, `Another landing page already uses "/${slug}".`);
  }
  if (await Redirect.exists({ from: `/${slug}`, isActive: true, ...(currentSlug ? { to: { $ne: `/${currentSlug}` } } : {}) })) {
    throw new ApiError(409, `"/${slug}" currently redirects elsewhere. Remove that redirect in SEO → Redirects first.`);
  }
}

function statusFields(status: unknown, wasPublished: boolean, currentPublishedAt?: Date) {
  if (status === ContentStatus.PUBLISHED) {
    return { status: ContentStatus.PUBLISHED, publishedAt: wasPublished && currentPublishedAt ? currentPublishedAt : new Date() };
  }
  return { status: ContentStatus.DRAFT };
}

export const adminListLandingPages = asyncHandler(async (req: Request, res: Response) => {
  const { status, pageType, search } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (pageType) query.pageType = pageType;
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    query.$or = [{ title: rx }, { slug: rx }, { h1: rx }];
  }
  const data = await LandingPage.find(query)
    .select("title slug pageType h1 status publishedAt updatedAt noindex showInFooter")
    .sort("-updatedAt")
    .limit(500);
  res.json({ success: true, data });
});

export const adminGetLandingPage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(404, "Landing page not found.");
  const page = await LandingPage.findById(req.params.id);
  if (!page) throw new ApiError(404, "Landing page not found.");
  res.json({ success: true, data: page });
});

export const adminCreateLandingPage = asyncHandler(async (req: Request, res: Response) => {
  const payload = buildPayload(req.body);
  await assertSlugFree(payload.slug);
  const page = await LandingPage.create({ ...payload, ...statusFields(req.body.status, false) });
  await logActivity(req, { action: "landing_page_created", module: "seo", recordId: String(page._id), meta: { slug: page.slug } });
  res.status(201).json({ success: true, data: page });
});

export const adminUpdateLandingPage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(404, "Landing page not found.");
  const existing = await LandingPage.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Landing page not found.");

  const payload = buildPayload(req.body);
  if (payload.slug !== existing.slug) await assertSlugFree(payload.slug, String(existing._id), existing.slug);
  const wasPublished = existing.status === ContentStatus.PUBLISHED;
  const status = req.body.status ? statusFields(req.body.status, wasPublished, existing.publishedAt) : {};

  const page = await LandingPage.findByIdAndUpdate(existing._id, { ...payload, ...status }, { new: true, runValidators: true });
  if (wasPublished && payload.slug !== existing.slug) await recordSlugChange("", existing.slug, payload.slug);
  await logActivity(req, { action: "landing_page_updated", module: "seo", recordId: String(existing._id), meta: { slug: payload.slug } });
  res.json({ success: true, data: page });
});

export const adminSetLandingPageStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(404, "Landing page not found.");
  const existing = await LandingPage.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Landing page not found.");
  const fields = statusFields(req.body.status, existing.status === ContentStatus.PUBLISHED, existing.publishedAt);
  const page = await LandingPage.findByIdAndUpdate(existing._id, fields, { new: true });
  await logActivity(req, { action: "landing_page_status_changed", module: "seo", recordId: String(existing._id), meta: { status: fields.status } });
  res.json({ success: true, data: page });
});

export const adminDeleteLandingPage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(404, "Landing page not found.");
  const page = await LandingPage.findByIdAndDelete(req.params.id);
  if (!page) throw new ApiError(404, "Landing page not found.");
  await logActivity(req, { action: "landing_page_deleted", module: "seo", recordId: String(page._id), meta: { slug: page.slug } });
  res.json({ success: true, message: "Landing page deleted." });
});
