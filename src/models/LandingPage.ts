import { Schema, model, Document, Types } from "mongoose";
import { ContentStatus } from "../types/enums";
import { imageRefSchema, pageIndexingFields, IImageRef, IPageIndexing } from "./seoFields";

export const LANDING_PAGE_TYPES = ["location", "service"] as const;
export type LandingPageType = (typeof LANDING_PAGE_TYPES)[number];

/** Which cars the page lists: none, every car offered in `location`, or a hand-picked set. */
export const LANDING_CARS_MODES = ["none", "location", "selected"] as const;
export type LandingCarsMode = (typeof LANDING_CARS_MODES)[number];

/**
 * Top-level URLs the site already uses. A landing page lives at "/<slug>",
 * so these slugs are off-limits.
 */
export const RESERVED_LANDING_SLUGS = new Set([
  "cars", "blogs", "about-us", "faq", "contact-us", "terms-and-conditions", "cancellation-policy",
  "refund-policy", "privacy-policy", "admin", "dashboard", "login", "book", "booking", "api",
  "revalidate", "images", "brand",
]);

export interface ILandingFaq {
  question: string;
  answer: string;
}

export interface ILandingPage extends Document, IPageIndexing {
  /** Internal name shown in the admin list. */
  title: string;
  slug: string;
  pageType: LandingPageType;
  h1: string;
  intro?: string;
  heroImage?: IImageRef;
  content: string;
  faqs: ILandingFaq[];
  location?: Types.ObjectId;
  carsMode: LandingCarsMode;
  carsHeading?: string;
  cars: Types.ObjectId[];
  status: ContentStatus;
  publishedAt?: Date;
  /** Adds a link to this page in the site footer (internal linking). */
  showInFooter: boolean;

  metaTitle?: string;
  metaDescription?: string;
  ogImage?: IImageRef;

  createdAt: Date;
  updatedAt: Date;
}

const landingPageSchema = new Schema<ILandingPage>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pageType: { type: String, enum: LANDING_PAGE_TYPES, default: "location" },
    h1: { type: String, required: true, trim: true },
    intro: { type: String, trim: true },
    heroImage: { type: imageRefSchema },
    content: { type: String, default: "" },
    faqs: {
      type: [{ question: { type: String, trim: true }, answer: { type: String, trim: true } }],
      default: [],
    },
    location: { type: Schema.Types.ObjectId, ref: "Location" },
    carsMode: { type: String, enum: LANDING_CARS_MODES, default: "none" },
    carsHeading: { type: String, trim: true },
    cars: [{ type: Schema.Types.ObjectId, ref: "Car" }],
    status: { type: String, enum: Object.values(ContentStatus), default: ContentStatus.DRAFT },
    publishedAt: { type: Date },
    showInFooter: { type: Boolean, default: false },

    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    ogImage: { type: imageRefSchema },
    ...pageIndexingFields,
  },
  { timestamps: true }
);

landingPageSchema.index({ status: 1, updatedAt: -1 });

export const LandingPage = model<ILandingPage>("LandingPage", landingPageSchema);
