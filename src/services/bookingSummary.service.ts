import { IBooking } from "../models/Booking";
import { Setting } from "../models/Setting";
import { Car } from "../models/Car";
import { DEFAULT_KM_PER_DAY, effectiveDailyRate, includedKm } from "./priceCalculator.service";
import { amountReceived, balanceDue } from "./payment.service";

/**
 * Server-computed figures shown on the customer booking page, the admin
 * booking page and the printable booking report — one source, so they can
 * never disagree.
 */
export async function bookingSummary(booking: IBooking) {
  let kmPolicy = booking.kmPolicy?.kmPerDay != null ? booking.kmPolicy : null;
  if (!kmPolicy) {
    // Bookings made before the km policy existed: current settings / car rate.
    const [settings, car] = await Promise.all([
      Setting.findOne({ key: "GLOBAL" }).select("booking").lean(),
      Car.findById((booking.car as { _id?: unknown })?._id ?? booking.car).select("extraKmRate").lean(),
    ]);
    kmPolicy = { kmPerDay: settings?.booking?.kmPerDay ?? DEFAULT_KM_PER_DAY, extraKmRate: car?.extraKmRate ?? 0 };
  }

  const collections = booking.payment.collections ?? [];
  const cashReceived = collections.filter((c) => c.mode === "CASH").reduce((s, c) => s + c.amount, 0);
  const onlineReceived = collections.filter((c) => c.mode === "ONLINE").reduce((s, c) => s + c.amount, 0);

  return {
    durationHours: booking.durationHours,
    durationDays: Math.floor(booking.durationHours / 24),
    durationRemainderHours: booking.durationHours % 24,
    dailyRate: booking.rates?.pricePerDay ?? (booking.rates ? effectiveDailyRate(booking.rates) : undefined),
    hourlyRate: booking.rates?.pricePerHour,
    kmPerDay: kmPolicy.kmPerDay,
    extraKmRate: kmPolicy.extraKmRate,
    includedKm: includedKm(booking.durationHours, kmPolicy.kmPerDay),
    amountReceived: amountReceived(booking),
    cashReceived,
    onlineReceived,
    balanceDue: balanceDue(booking),
  };
}
