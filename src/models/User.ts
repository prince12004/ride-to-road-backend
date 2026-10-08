import { Schema, model, Document } from "mongoose";
import { VerificationStatus } from "../types/enums";

export interface IVerificationDocument {
  type: string;
  url: string;
  publicId: string;
}

export interface IUser extends Document {
  name?: string;
  mobile: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  profileImage?: { url: string; publicId: string };

  isBlocked: boolean;
  isVerifiedMobile: boolean;

  // OTP login — hashed OTP + expiry, never store the raw code.
  otpHash?: string;
  otpExpires?: Date;
  otpAttempts: number;
  otpRequestedAt?: Date;

  verification: {
    status: VerificationStatus;
    documents: IVerificationDocument[];
    rejectionReason?: string;
    submittedAt?: Date;
    reviewedAt?: Date;
  };

  refreshTokens: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, trim: true, default: "" },
    mobile: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    profileImage: { url: String, publicId: String },

    isBlocked: { type: Boolean, default: false },
    isVerifiedMobile: { type: Boolean, default: false },

    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpRequestedAt: { type: Date, select: false },

    verification: {
      status: { type: String, enum: Object.values(VerificationStatus), default: VerificationStatus.NOT_SUBMITTED },
      documents: [{ type: { type: String }, url: String, publicId: String }],
      rejectionReason: { type: String },
      submittedAt: { type: Date },
      reviewedAt: { type: Date },
    },

    refreshTokens: { type: [String], default: [], select: false },
  },
  { timestamps: true }
);

export const User = model<IUser>("User", userSchema);
