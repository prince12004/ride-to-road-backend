import sanitizeHtml from "sanitize-html";
import slugify from "slugify";
import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { Blog } from "../../models/Blog";
import { ContentStatus } from "../../types/enums";
import { logActivity } from "../../services/activityLog.service";

function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "figure", "figcaption"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height"],
      a: ["href", "name", "target", "rel"],
    },
  });
}

function estimateReadingTime(html: string): string {
  const text = html.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

export function prepareBlogBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body.content) req.body.content = sanitizeContent(req.body.content);
  if (!req.body.slug && req.body.title) req.body.slug = slugify(req.body.title, { lower: true, strict: true });
  if (req.body.content) req.body.readTime = estimateReadingTime(req.body.content);
  next();
}

export const adminListBlogs = asyncHandler(async (req: Request, res: Response) => {
  const { status, category, search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (category) query.category = category;
  if (search) query.title = { $regex: search, $options: "i" };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [blogs, total] = await Promise.all([
    Blog.find(query).populate("category", "name").sort("-createdAt").skip((pageNum - 1) * limitNum).limit(limitNum),
    Blog.countDocuments(query),
  ]);

  res.json({ success: true, data: blogs, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
});

export const adminGetBlog = asyncHandler(async (req: Request, res: Response) => {
  const blog = await Blog.findById(req.params.id).populate("category");
  if (!blog) throw new ApiError(404, "Blog not found.");
  res.json({ success: true, data: blog });
});

export const adminCreateBlog = asyncHandler(async (req: Request, res: Response) => {
  if (req.body.status === ContentStatus.PUBLISHED && !req.body.publishedAt) req.body.publishedAt = new Date();
  const blog = await Blog.create(req.body);
  await logActivity(req, { action: "blog_created", module: "blogs", recordId: String(blog._id) });
  res.status(201).json({ success: true, data: blog });
});

export const adminUpdateBlog = asyncHandler(async (req: Request, res: Response) => {
  const existing = await Blog.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Blog not found.");

  if (req.body.status === ContentStatus.PUBLISHED && existing.status !== ContentStatus.PUBLISHED && !req.body.publishedAt) {
    req.body.publishedAt = new Date();
  }

  const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await logActivity(req, { action: "blog_updated", module: "blogs", recordId: String(blog!._id) });
  res.json({ success: true, data: blog });
});

export const adminDeleteBlog = asyncHandler(async (req: Request, res: Response) => {
  const blog = await Blog.findByIdAndDelete(req.params.id);
  if (!blog) throw new ApiError(404, "Blog not found.");
  await logActivity(req, { action: "blog_deleted", module: "blogs", recordId: String(blog._id) });
  res.json({ success: true, message: "Blog deleted." });
});

export const adminSetBlogStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: ContentStatus };
  const update: Record<string, unknown> = { status };
  if (status === ContentStatus.PUBLISHED) update.publishedAt = new Date();

  const blog = await Blog.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!blog) throw new ApiError(404, "Blog not found.");
  await logActivity(req, { action: "blog_status_changed", module: "blogs", recordId: String(blog._id), meta: { status } });
  res.json({ success: true, data: blog });
});
