import { Schema, model, Document, Types } from "mongoose";
import { BookingStatus } from "../types/enums";

export interface IBookingStatusHistory extends Document {
  booking: Types.ObjectId;
  status: BookingStatus;
  note?: string;
  changedByAdmin?: Types.ObjectId;
  createdAt: Date;
}

const bookingStatusHistorySchema = new Schema<IBookingStatusHistory>(
  {
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    status: { type: String, enum: Object.values(BookingStatus), required: true },
    note: { type: String },
    changedByAdmin: { type: Schema.Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookingStatusHistorySchema.index({ booking: 1, createdAt: 1 });

export const BookingStatusHistory = model<IBookingStatusHistory>("BookingStatusHistory", bookingStatusHistorySchema);
