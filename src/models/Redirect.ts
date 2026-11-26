import { Schema, model, Document } from "mongoose";

export interface IRedirect extends Document {
  /** Site path that should no longer serve content, e.g. "/blogs/old-slug". */
  from: string;
  /** Site path or absolute URL to send visitors to. */
  to: string;
  statusCode: 301 | 302;
  isActive: boolean;
  /** Free-text reason; auto-created redirects say so here. */
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const redirectSchema = new Schema<IRedirect>(
  {
    from: { type: String, required: true, unique: true, trim: true },
    to: { type: String, required: true, trim: true },
    statusCode: { type: Number, enum: [301, 302], default: 301 },
    isActive: { type: Boolean, default: true },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

export const Redirect = model<IRedirect>("Redirect", redirectSchema);
