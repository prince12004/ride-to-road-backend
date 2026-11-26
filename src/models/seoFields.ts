import { Schema } from "mongoose";

export interface IImageRef {
  url: string;
  publicId?: string;
}

/** Uploaded image reference (Cloudinary url + publicId), stored without its own _id. */
export const imageRefSchema = new Schema<IImageRef>({ url: String, publicId: String }, { _id: false });

/** Page-level indexing controls shared by every SEO-managed page (blogs, cars, static pages). */
export interface IPageIndexing {
  /** Absolute URL or site path; empty means the page is its own canonical. */
  canonicalUrl?: string;
  noindex: boolean;
  nofollow: boolean;
  includeInSitemap: boolean;
}

export const pageIndexingFields = {
  canonicalUrl: { type: String, trim: true },
  noindex: { type: Boolean, default: false },
  nofollow: { type: Boolean, default: false },
  includeInSitemap: { type: Boolean, default: true },
};
