import { Schema, model, Document, Types } from "mongoose";

export interface IActivityLog extends Document {
  admin: Types.ObjectId;
  action: string;
  module: string;
  recordId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    admin: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    action: { type: String, required: true },
    module: { type: String, required: true },
    recordId: { type: String },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ admin: 1, createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });

export const ActivityLog = model<IActivityLog>("ActivityLog", activityLogSchema);
