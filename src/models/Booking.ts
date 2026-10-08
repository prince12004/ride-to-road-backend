import { Schema, model, Document, Types } from "mongoose";
import { BookingStatus, PaymentStatus, PaymentMethod, BookingSource } from "../types/enums";

/** One admin-applied extension of the drop date/time. */
export interface IBookingExtension {
  previousDropAt: Date;
  newDropAt: Date;
  extraHours: number;
  amount: number;
  paymentStatus: PaymentStatus.PAID | PaymentStatus.PENDING;
  paymentMethod?: PaymentMethod;
  note?: string;
  extendedBy?: Types.ObjectId;
  createdAt: Date;
}

export interface IBooking extends Document {
  bookingId: string;
  user?: Types.ObjectId;
  car: Types.ObjectId;

  customerName: string;
  mobile: string;
  email?: string;
  address?: string;

  pickupLocation: Types.ObjectId;
  dropLocation: Types.ObjectId;
  pickupDate: Date;
  pickupTime: string;
  dropDate: Date;
  dropTime: string;
  pickupAt: Date;
  dropAt: Date;
  durationHours: number;

  coupon?: Types.ObjectId;
  baseAmount: number;
  additionalCharges: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  extensionCharges: number;
  extensions: IBookingExtension[];

  homeDelivery: {
    requested: boolean;
    fee: number;
  };

  payment: {
    status: PaymentStatus;
    method?: PaymentMethod;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    amount?: number;
    paidAt?: Date;
    failureReason?: string;
  };

  status: BookingStatus;
  source: BookingSource;
  specialRequest?: string;
  adminNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    bookingId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    car: { type: Schema.Types.ObjectId, ref: "Car", required: true },

    customerName: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },

    pickupLocation: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    dropLocation: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    pickupDate: { type: Date, required: true },
    pickupTime: { type: String, required: true },
    dropDate: { type: Date, required: true },
    dropTime: { type: String, required: true },
    pickupAt: { type: Date, required: true },
    dropAt: { type: Date, required: true },
    durationHours: { type: Number, required: true },

    coupon: { type: Schema.Types.ObjectId, ref: "Coupon" },
    baseAmount: { type: Number, required: true },
    additionalCharges: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    extensionCharges: { type: Number, default: 0 },
    extensions: [
      {
        previousDropAt: { type: Date, required: true },
        newDropAt: { type: Date, required: true },
        extraHours: { type: Number, required: true },
        amount: { type: Number, required: true },
        paymentStatus: { type: String, enum: [PaymentStatus.PAID, PaymentStatus.PENDING], required: true },
        paymentMethod: { type: String, enum: Object.values(PaymentMethod) },
        note: { type: String },
        extendedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    homeDelivery: {
      requested: { type: Boolean, default: false },
      fee: { type: Number, default: 0 },
    },

    payment: {
      status: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING },
      method: { type: String, enum: Object.values(PaymentMethod) },
      razorpayOrderId: { type: String },
      razorpayPaymentId: { type: String },
      razorpaySignature: { type: String },
      amount: { type: Number },
      paidAt: { type: Date },
      failureReason: { type: String },
    },

    status: { type: String, enum: Object.values(BookingStatus), default: BookingStatus.PAYMENT_PENDING },
    source: { type: String, enum: Object.values(BookingSource), default: BookingSource.ONLINE },
    specialRequest: { type: String },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

bookingSchema.index({ car: 1, pickupAt: 1, dropAt: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ "payment.status": 1 });
bookingSchema.index({ user: 1 });
bookingSchema.index({ mobile: 1 });
bookingSchema.index({ "payment.razorpayOrderId": 1 });

export const Booking = model<IBooking>("Booking", bookingSchema);
