import { IBooking } from "../models/Booking";
import { PaymentStatus } from "../types/enums";

/**
 * Amount received so far. Bookings made before payment collections existed
 * have no `amountReceived`: a booking already marked PAID counts as paid in
 * full (what was recorded then), anything else as nothing received.
 */
export function amountReceived(booking: IBooking): number {
  if (typeof booking.payment.amountReceived === "number") return booking.payment.amountReceived;
  if (booking.payment.status === PaymentStatus.PAID) return booking.payment.amount ?? booking.totalAmount;
  return 0;
}

export function balanceDue(booking: IBooking): number {
  return Math.max(0, booking.totalAmount - amountReceived(booking));
}

/**
 * Sets payment.status from the money received: Fully Paid once the total is
 * covered, Partially Paid when something (but not all) has come in, and
 * otherwise leaves Pending / Failed as they were. Call after the received
 * amount or the booking total changes (e.g. an extension).
 */
export function syncPaymentStatus(booking: IBooking): void {
  const received = amountReceived(booking);
  booking.payment.amountReceived = received;

  if (received >= booking.totalAmount && booking.totalAmount > 0) {
    if (booking.payment.status !== PaymentStatus.PAID) booking.payment.paidAt = new Date();
    booking.payment.status = PaymentStatus.PAID;
    booking.payment.amount = received;
  } else if (received > 0) {
    booking.payment.status = PaymentStatus.PARTIALLY_PAID;
  } else if (booking.payment.status === PaymentStatus.PAID || booking.payment.status === PaymentStatus.PARTIALLY_PAID) {
    booking.payment.status = PaymentStatus.PENDING;
  }
}
