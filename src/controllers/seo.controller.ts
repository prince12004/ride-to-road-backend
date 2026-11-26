import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { PageSeo } from "../models/PageSeo";
import { Redirect } from "../models/Redirect";
import { Blog } from "../models/Blog";
import { Car } from "../models/Car";
import { LandingPage } from "../models/LandingPage";
import { CarStatus, ContentStatus } from "../types/enums";
import { livePublishedFilter } from "../utils/publishFilter";

/** Saved SEO overrides for the static pages (pages without overrides are absent). */
export const listPageSeo = asyncHandler(async (_req: Request, res: Response) => {
  const data = await PageSeo.find().select("-_id -__v").lean();
  res.json({ success: true, data });
});

/** Active redirects, read by the website's request middleware. */
export const listActiveRedirects = asyncHandler(async (_req: Request, res: Response) => {
  const data = await Redirect.find({ isActive: true }).select("from to statusCode -_id").lean();
  res.json({ success: true, data });
});

/** Dynamic URLs eligible for sitemap.xml: public, indexable and not opted out. */
export const getSitemapEntries = asyncHandler(async (_req: Request, res: Response) => {
  const indexable = { includeInSitemap: { $ne: false }, noindex: { $ne: true } };
  const [blogs, cars, landingPages] = await Promise.all([
    Blog.find({ ...livePublishedFilter(), ...indexable }).select("slug updatedAt -_id").lean(),
    Car.find({ status: { $ne: CarStatus.INACTIVE }, "seo.includeInSitemap": { $ne: false }, "seo.noindex": { $ne: true } })
      .select("slug updatedAt -_id")
      .lean(),
    LandingPage.find({ status: ContentStatus.PUBLISHED, ...indexable }).select("slug updatedAt -_id").lean(),
  ]);
  res.json({ success: true, data: { blogs, cars, landingPages } });
});
