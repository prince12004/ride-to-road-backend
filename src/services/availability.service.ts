import { Types } from "mongoose";
import { Booking } from "../models/Booking";
import { ACTIVE_BOOKING_STATUSES } from "../types/enums";

interface AvailabilityParams {
  carId: string | Types.ObjectId;
  pickupAt: Date;
  dropAt: Date;
  excludeBookingId?: string | Types.ObjectId;
}

/** Two intervals [a1,a2) and [b1,b2) overlap iff a1 < b2 AND b1 < a2. */
export async function isCarAvailable({ carId, pickupAt, dropAt, excludeBookingId }: AvailabilityParams): Promise<boolean> {
  const query: Record<string, unknown> = {
    car: carId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    pickupAt: { $lt: dropAt },
    dropAt: { $gt: pickupAt },
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };

  const conflict = await Booking.findOne(query).lean();
  return !conflict;
}

export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const datePart = new Date(dateStr);
  const [time, meridiem] = timeStr.trim().split(/\s+/);
  let [hours, minutes] = time.split(":").map(Number);

  if (meridiem) {
    const upper = meridiem.toUpperCase();
    if (upper === "PM" && hours < 12) hours += 12;
    if (upper === "AM" && hours === 12) hours = 0;
  }

  const combined = new Date(datePart);
  combined.setHours(hours, minutes || 0, 0, 0);
  return combined;
}
