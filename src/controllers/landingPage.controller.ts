import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { LandingPage } from "../models/LandingPage";
import { Car } from "../models/Car";
import { Location } from "../models/Location";
import { CarStatus, ContentStatus } from "../types/enums";
import { serializeCarSummary } from "../utils/serializers";

/** A published landing page with its car list resolved. */
export const getLandingPageBySlug = asyncHandler(async (req: Request, res: Response) => {
  const page = await LandingPage.findOne({ slug: req.params.slug, status: ContentStatus.PUBLISHED }).lean();
  if (!page) throw new ApiError(404, "Page not found.");

  let cars: ReturnType<typeof serializeCarSummary>[] = [];
  const listed = { status: { $ne: CarStatus.INACTIVE } };
  if (page.carsMode === "location" && page.location) {
    const loc = await Location.findById(page.location).lean();
    const query = loc?.showAllCars
      ? listed
      : { ...listed, $or: [{ location: page.location }, { cities: page.location }, { allCities: true }] };
    const docs = await Car.find(query).sort("-isFeatured -createdAt").limit(24);
    cars = docs.map((c) => ({ ...serializeCarSummary(c), available: c.status === CarStatus.AVAILABLE }));
  } else if (page.carsMode === "selected" && page.cars?.length) {
    const docs = await Car.find({ _id: { $in: page.cars }, ...listed });
    const order = new Map(page.cars.map((id, i) => [String(id), i]));
    cars = docs
      .sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0))
      .map((c) => ({ ...serializeCarSummary(c), available: c.status === CarStatus.AVAILABLE }));
  }

  const location = page.location ? await Location.findById(page.location).select("city region slug").lean() : null;
  const { cars: _ids, ...rest } = page;
  res.json({ success: true, data: { ...rest, location, cars } });
});

/** Published pages flagged "show in footer" — internal links on every page. */
export const listFooterLandingPages = asyncHandler(async (_req: Request, res: Response) => {
  const data = await LandingPage.find({ status: ContentStatus.PUBLISHED, showInFooter: true, noindex: { $ne: true } })
    .select("slug h1 title -_id")
    .sort("title")
    .limit(12)
    .lean();
  res.json({ success: true, data });
});
