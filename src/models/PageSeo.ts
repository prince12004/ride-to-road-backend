import { Schema, model, Document } from "mongoose";
import { imageRefSchema, pageIndexingFields, IImageRef, IPageIndexing } from "./seoFields";

/**
 * Fixed (code-defined) public pages whose meta tags are editable from the
 * admin panel. Dynamic pages (blogs, cars) carry their own SEO fields.
 */
export const STATIC_SEO_PAGES = [
  { path: "/", label: "Home" },
  { path: "/cars", label: "Cars listing" },
  { path: "/blogs", label: "Blogs listing" },
  { path: "/about-us", label: "About Us" },
  { path: "/faq", label: "FAQ" },
  { path: "/contact-us", label: "Contact Us" },
  { path: "/terms-and-conditions", label: "Terms & Conditions" },
  { path: "/cancellation-policy", label: "Cancellation Policy" },
  { path: "/refund-policy", label: "Refund Policy" },
  { path: "/privacy-policy", label: "Privacy Policy" },
] as const;

export const STATIC_SEO_PATHS: string[] = STATIC_SEO_PAGES.map((p) => p.path);

export interface IPageSeo extends Document, IPageIndexing {
  path: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: IImageRef;
  updatedAt: Date;
}

const pageSeoSchema = new Schema<IPageSeo>(
  {
    path: { type: String, required: true, unique: true, enum: STATIC_SEO_PATHS },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    ogImage: { type: imageRefSchema },
    ...pageIndexingFields,
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const PageSeo = model<IPageSeo>("PageSeo", pageSeoSchema);
