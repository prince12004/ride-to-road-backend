import { Schema, model, Document, Types } from "mongoose";
import { BookingStatus, PaymentStatus, PaymentMethod, BookingSource } from "../types/enums";

/** Rates agreed when the booking was made — extensions are priced from these. */
export interface IBookingRates {
  pricePerHour?: number;
  pricePerDay: number;
  weeklyPrice?: number;
  monthlyPrice?: number;
}

/** Kilometre policy agreed at booking time. */
export interface IBookingKmPolicy {
  kmPerDay: number;
  extraKmRate: number;
}

/** Recorded when the car comes back and the booking is closed. */
export interface IBookingClosure {
  closedAt: Date;
  odometerStart?: number;
  odometerEnd?: number;
  kmDriven: number;
  includedKm: number;
  extraKm: number;
  extraKmCharge: number;
  otherCharges: number;
  otherChargesNote?: string;
  notes?: string;
  closedBy?: Types.ObjectId;
}

/** One payment received against the booking (a COD booking may be paid in parts). */
export interface IPaymentCollection {
  mode: "CASH" | "ONLINE";
  /** For online payments: UPI, bank transfer, card… */
  method?: "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";
  amount: number;
  /** UTR / transaction id — required for online payments. */
  reference?: string;
  receivedAt: Date;
  note?: string;
  recordedBy?: Types.ObjectId;
  createdAt: Date;
}

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
  securityDeposit: number;
  totalAmount: number;
  rates?: IBookingRates;
  kmPolicy?: IBookingKmPolicy;
  closure?: IBookingClosure;
  /** Soft delete: hidden from lists, financial records kept. */
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  deleteReason?: string;
  extensionCharges: number;
  extensions: IBookingExtension[];

  homeDelivery: {
    requested: boolean;
    fee: number;
    /** Where to drop the car; required when delivery is requested. */
    address?: string;
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
    /** Sum of `collections`; the balance due is totalAmount - amountReceived. */
    amountReceived?: number;
    collections?: IPaymentCollection[];
    proof?: { url: string; publicId: string; uploadedAt: Date };
    reviewNote?: string;
    reviewedAt?: Date;
  };

  status: BookingStatus;
  source: BookingSource;
  specialRequest?: string;
  adminNotes?: string;
  termsAcceptedAt?: Date;

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
    // Refundable deposit, already included in totalAmount.
    securityDeposit: { type: Number, default: 0 },
    kmPolicy: {
      kmPerDay: { type: Number },
      extraKmRate: { type: Number },
    },
    closure: {
      closedAt: { type: Date },
      odometerStart: { type: Number },
      odometerEnd: { type: Number },
      kmDriven: { type: Number },
      includedKm: { type: Number },
      extraKm: { type: Number },
      extraKmCharge: { type: Number },
      otherCharges: { type: Number },
      otherChargesNote: { type: String },
      notes: { type: String },
      closedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    deleteReason: { type: String },
    rates: {
      pricePerHour: { type: Number },
      pricePerDay: { type: Number },
      weeklyPrice: { type: Number },
      monthlyPrice: { type: Number },
    },
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
      address: { type: String, trim: true },
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
      amountReceived: { type: Number },
      collections: [
        {
          mode: { type: String, enum: ["CASH", "ONLINE"], required: true },
          method: { type: String, enum: ["UPI", "BANK_TRANSFER", "CARD", "OTHER"] },
          amount: { type: Number, required: true, min: 0 },
          reference: { type: String, trim: true },
          receivedAt: { type: Date, required: true },
          note: { type: String },
          recordedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      // UPI QR: customer's payment screenshot, verified manually by admin.
      proof: {
        url: { type: String },
        publicId: { type: String },
        uploadedAt: { type: Date },
      },
      reviewNote: { type: String },
      reviewedAt: { type: Date },
    },

    status: { type: String, enum: Object.values(BookingStatus), default: BookingStatus.PAYMENT_PENDING },
    source: { type: String, enum: Object.values(BookingSource), default: BookingSource.ONLINE },
    specialRequest: { type: String },
    adminNotes: { type: String },
    termsAcceptedAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ car: 1, pickupAt: 1, dropAt: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ "payment.status": 1 });
bookingSchema.index({ user: 1 });
bookingSchema.index({ mobile: 1 });
bookingSchema.index({ "payment.razorpayOrderId": 1 });

// Soft-deleted bookings disappear from every query and aggregate unless the
// caller opts in with `{ includeDeleted: true }` (query option or aggregate
// option). Their payments and history stay in the database.
const NOT_DELETED = { deletedAt: { $exists: false } };
for (const op of ["find", "findOne", "countDocuments", "findOneAndUpdate", "updateMany", "updateOne"] as const) {
  bookingSchema.pre(op, function () {
    if (!this.getOptions().includeDeleted) this.where(NOT_DELETED);
  });
}
bookingSchema.pre("aggregate", function () {
  if (!(this.options as { includeDeleted?: boolean }).includeDeleted) this.pipeline().unshift({ $match: NOT_DELETED });
});

export const Booking = model<IBooking>("Booking", bookingSchema);
