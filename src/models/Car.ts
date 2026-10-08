import { Schema, model, Types } from "mongoose";
import { CarStatus, CarCategory, FuelType, TransmissionType } from "../types/enums";

export interface ICarImage {
  url: string;
  publicId: string;
}

// Deliberately does not extend mongoose.Document — a field named `model`
// collides with Document's own `model()` method. HydratedDocument<ICar>
// (what Car.findById etc. actually return) merges this correctly.
export interface ICar {
  _id: Types.ObjectId;
  name: string;
  brand: string;
  model: string;
  slug: string;
  category: CarCategory;
  transmission: TransmissionType;
  fuel: FuelType;
  seats: number;
  tag?: string;

  pricePerDay: number;
  pricePerHour?: number;
  weeklyPrice?: number;
  monthlyPrice?: number;
  securityDeposit?: number;

  homeDelivery: {
    available: boolean;
    price: number;
  };

  description?: string;
  features: string[];
  specifications: { label: string; value: string }[];

  location: Types.ObjectId;
  mainImage: ICarImage;
  gallery: ICarImage[];

  documents?: {
    rc?: ICarImage;
    insurance?: ICarImage;
    puc?: ICarImage;
  };

  status: CarStatus;
  isFeatured: boolean;

  seo: {
    seoTitle?: string;
    metaDescription?: string;
    ogImage?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const carImageSchema = new Schema<ICarImage>(
  { url: { type: String, required: true }, publicId: { type: String, required: true } },
  { _id: false }
);

const carSchema = new Schema<ICar>(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: String, enum: Object.values(CarCategory), required: true },
    transmission: { type: String, enum: Object.values(TransmissionType), required: true },
    fuel: { type: String, enum: Object.values(FuelType), required: true },
    seats: { type: Number, required: true, min: 1 },
    tag: { type: String, trim: true },

    pricePerDay: { type: Number, required: true, min: 0 },
    pricePerHour: { type: Number, min: 0 },
    weeklyPrice: { type: Number, min: 0 },
    monthlyPrice: { type: Number, min: 0 },
    securityDeposit: { type: Number, min: 0, default: 0 },

    homeDelivery: {
      available: { type: Boolean, default: false },
      price: { type: Number, min: 0, default: 0 },
    },

    description: { type: String },
    features: { type: [String], default: [] },
    specifications: [{ label: String, value: String }],

    location: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    mainImage: { type: carImageSchema, required: true },
    gallery: { type: [carImageSchema], default: [] },

    documents: {
      rc: carImageSchema,
      insurance: carImageSchema,
      puc: carImageSchema,
    },

    status: { type: String, enum: Object.values(CarStatus), default: CarStatus.AVAILABLE },
    isFeatured: { type: Boolean, default: false },

    seo: {
      seoTitle: String,
      metaDescription: String,
      ogImage: String,
    },
  },
  { timestamps: true }
);

carSchema.index({ location: 1 });
carSchema.index({ category: 1 });
carSchema.index({ status: 1 });
carSchema.index({ isFeatured: 1 });
carSchema.index({ pricePerDay: 1 });

export const Car = model<ICar>("Car", carSchema);
