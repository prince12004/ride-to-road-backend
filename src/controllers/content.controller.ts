import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { Location } from "../models/Location";
import { Offer } from "../models/Offer";
import { Testimonial } from "../models/Testimonial";
import { Faq } from "../models/Faq";
import { Journey } from "../models/Journey";
import { Blog } from "../models/Blog";
import { ContentStatus } from "../types/enums";

export const listLocations = asyncHandler(async (_req: Request, res: Response) => {
  const locations = await Location.find({ isActive: true }).sort("city");
  res.json({
    success: true,
    data: locations.map((l) => ({
      id: String(l._id),
      slug: l.slug,
      city: l.city,
      region: l.region,
      image: l.image?.url,
    })),
  });
});

export const getFeaturedOffer = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const offer = await Offer.findOne({
    isActive: true,
    $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }],
  }).sort("-createdAt");

  if (!offer) return res.json({ success: true, data: null });
  res.json({
    success: true,
    data: {
      id: String(offer._id),
      code: offer.code,
      eyebrow: offer.eyebrow,
      title: offer.title,
      description: offer.description,
      terms: offer.terms,
      image: offer.image?.url,
      ctaLabel: offer.ctaLabel,
      ctaHref: offer.ctaHref,
    },
  });
});

export const listTestimonials = asyncHandler(async (_req: Request, res: Response) => {
  const testimonials = await Testimonial.find({ isPublished: true }).sort("-createdAt");
  res.json({
    success: true,
    data: testimonials.map((t) => ({
      id: String(t._id),
      name: t.name,
      location: t.location,
      rating: t.rating,
      quote: t.quote,
      car: t.car,
    })),
  });
});

export const listFaqs = asyncHandler(async (_req: Request, res: Response) => {
  const faqs = await Faq.find({ isPublished: true }).sort("order createdAt");
  res.json({ success: true, data: faqs.map((f) => ({ id: String(f._id), question: f.question, answer: f.answer })) });
});

export const listJourneys = asyncHandler(async (_req: Request, res: Response) => {
  const journeys = await Journey.find({ isActive: true }).sort("createdAt");
  res.json({
    success: true,
    data: journeys.map((j) => ({
      id: String(j._id),
      slug: j.slug,
      from: j.from,
      to: j.to,
      distanceKm: j.distanceKm,
      driveTime: j.driveTime,
      highlight: j.highlight,
      image: j.image?.url,
    })),
  });
});

export const listBlogs = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = req.query as Record<string, string>;
  const q = Blog.find({ status: ContentStatus.PUBLISHED })
    .populate("category", "name slug")
    .sort("-publishedAt");
  if (limit) q.limit(Number(limit));

  const blogs = await q;
  res.json({
    success: true,
    data: blogs.map((b) => ({
      id: String(b._id),
      slug: b.slug,
      title: b.title,
      excerpt: b.excerpt,
      category: (b.category as unknown as { name?: string })?.name ?? "General",
      image: b.image?.url,
      readTime: b.readTime,
      publishedAt: b.publishedAt,
    })),
  });
});

export const getBlogBySlug = asyncHandler(async (req: Request, res: Response) => {
  const blog = await Blog.findOne({ slug: req.params.slug, status: ContentStatus.PUBLISHED }).populate("category", "name slug");
  if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });
  res.json({ success: true, data: blog });
});
