import { Schema, model, Document, Types } from "mongoose";
import { ContentStatus } from "../types/enums";

export interface IBlog extends Document {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  category?: Types.ObjectId;
  image: { url: string; publicId: string };
  author?: string;
  readTime?: string;
  status: ContentStatus;
  publishedAt?: Date;

  seoTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;

  createdAt: Date;
  updatedAt: Date;
}

const blogSchema = new Schema<IBlog>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String },
    content: { type: String, required: true },
    category: { type: Schema.Types.ObjectId, ref: "BlogCategory" },
    image: { url: { type: String, required: true }, publicId: { type: String, required: true } },
    author: { type: String },
    readTime: { type: String },
    status: { type: String, enum: Object.values(ContentStatus), default: ContentStatus.DRAFT },
    publishedAt: { type: Date },

    seoTitle: { type: String },
    metaDescription: { type: String },
    keywords: { type: [String], default: [] },
    ogTitle: { type: String },
    ogDescription: { type: String },
    ogImage: { type: String },
  },
  { timestamps: true }
);

blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ category: 1 });

export const Blog = model<IBlog>("Blog", blogSchema);
