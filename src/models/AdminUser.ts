import { Schema, model, Document } from "mongoose";
import bcrypt from "bcryptjs";
import { AdminRole, AdminPermissionModule, ADMIN_PERMISSION_MODULES } from "../types/enums";

export interface IAdminUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: AdminRole;
  permissions: AdminPermissionModule[];
  isActive: boolean;
  refreshTokens: string[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const adminUserSchema = new Schema<IAdminUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(AdminRole), default: AdminRole.MANAGER },
    permissions: { type: [String], enum: ADMIN_PERMISSION_MODULES, default: [] },
    isActive: { type: Boolean, default: true },
    refreshTokens: { type: [String], default: [], select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

adminUserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

adminUserSchema.methods.comparePassword = async function (candidate: string) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export const AdminUser = model<IAdminUser>("AdminUser", adminUserSchema);
