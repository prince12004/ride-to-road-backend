import { ICar } from "../models/Car";
import { HydratedDocument } from "mongoose";
import { ILocation } from "../models/Location";

type PopulatedCar = HydratedDocument<ICar> & { location: HydratedDocument<ILocation> | unknown };

function toPlainCar(car: PopulatedCar): ICar {
  return (car.toObject ? car.toObject() : car) as unknown as ICar;
}

/**
 * Maps the richer backend Car document to the flat shape the existing
 * frontend `Car` type / `CarCard` component expect, so the homepage and
 * car listing never need to change when swapping static data for the API.
 */
export function serializeCarSummary(car: PopulatedCar) {
  const obj = toPlainCar(car);
  return {
    id: String(obj._id),
    slug: obj.slug,
    name: obj.name,
    brand: obj.brand,
    category: obj.category,
    transmission: obj.transmission,
    fuel: obj.fuel,
    seats: obj.seats,
    pricePerDay: obj.pricePerDay,
    pricePerHour: obj.pricePerHour,
    image: obj.mainImage?.url,
    tag: obj.tag,
    status: obj.status,
    homeDelivery: obj.homeDelivery ?? { available: false, price: 0 },
  };
}

export function serializeCarDetail(car: PopulatedCar) {
  const obj = toPlainCar(car);
  return {
    ...serializeCarSummary(car),
    _id: String(obj._id),
    model: obj.model,
    weeklyPrice: obj.weeklyPrice,
    monthlyPrice: obj.monthlyPrice,
    securityDeposit: obj.securityDeposit,
    description: obj.description,
    features: obj.features,
    specifications: obj.specifications,
    gallery: (obj.gallery ?? []).map((g) => g.url),
    location: obj.location,
    status: obj.status,
    isFeatured: obj.isFeatured,
    seo: obj.seo,
  };
}
