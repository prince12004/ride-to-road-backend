import { Schema } from "mongoose";

export interface IImageRef {
  url: string;
  publicId?: string;
  /** Alt text for accessibility and image search. */
  alt?: string;
}

/** Uploaded image reference (Cloudinary url + publicId + alt), stored without its own _id. */
export const imageRefSchema = new Schema<IImageRef>({ url: String, publicId: String, alt: { type: String, trim: true } }, { _id: false });

/** Page-level indexing controls shared by every SEO-managed page (blogs, cars, static pages). */
export interface IPageIndexing {
  /** Absolute URL or site path; empty means the page is its own canonical. */
  canonicalUrl?: string;
  noindex: boolean;
  nofollow: boolean;
  includeInSitemap: boolean;
  /** Extra JSON-LD (validated JSON) added to the page alongside the automatic schema. */
  customSchema?: string;
}

export const pageIndexingFields = {
  canonicalUrl: { type: String, trim: true },
  noindex: { type: Boolean, default: false },
  nofollow: { type: Boolean, default: false },
  includeInSitemap: { type: Boolean, default: true },
  customSchema: { type: String, default: "" },
};
