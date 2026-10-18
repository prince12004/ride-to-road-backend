/**
 * One-off fix for bookings saved while combineDateAndTime used the server's
 * time zone: on the UTC VPS a "10:00" pickup was stored as 10:00 UTC
 * (15:30 IST). Such bookings are moved back by 5h30m so the stored instants
 * match the pickup/drop times the customer picked. Durations and prices are
 * unchanged (both ends move together).
 *
 * A booking is only touched when its stored instant, read in UTC, equals the
 * time string the customer chose — bookings already in IST are left alone.
 *
 *   node dist/scripts/fixBookingTimezone.js            # dry run
 *   node dist/scripts/fixBookingTimezone.js --apply    # write (backup JSON saved first)
 */
import { writeFileSync } from "fs";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Booking } from "../models/Booking";

const SHIFT_MS = 330 * 60 * 1000;
const apply = process.argv.includes("--apply");

function hhmm(timeStr: string): string {
  const [time, meridiem] = timeStr.trim().split(/\s+/);
  let [h, m] = time.split(":").map(Number);
  if (meridiem?.toUpperCase() === "PM" && h < 12) h += 12;
  if (meridiem?.toUpperCase() === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}
const utcHM = (d: Date) => d.toISOString().slice(11, 16);
const shift = (d?: Date | null) => (d ? new Date(new Date(d).getTime() - SHIFT_MS) : d);
const sameInstant = (a?: Date | null, b?: Date | null) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

(async () => {
  await mongoose.connect(env.mongoUri);
  const docs = await Booking.collection.find({}).toArray();
  const backup: unknown[] = [];
  const ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
  let mixed = 0;

  for (const b of docs) {
    if (!b.pickupAt || !b.dropAt || !b.pickupTime || !b.dropTime) continue;
    const pickupShifted = utcHM(b.pickupAt) === hhmm(b.pickupTime);
    const dropShifted = utcHM(b.dropAt) === hhmm(b.dropTime);
    if (!pickupShifted && !dropShifted) continue;
    if (pickupShifted !== dropShifted) {
      mixed++;
      console.log(`SKIP (only one end matches, check by hand): ${b.bookingId} pickup ${b.pickupTime} ${b.pickupAt.toISOString()} drop ${b.dropTime} ${b.dropAt.toISOString()}`);
      continue;
    }

    const set: Record<string, unknown> = { pickupAt: shift(b.pickupAt), dropAt: shift(b.dropAt) };
    if (sameInstant(b.pickupDate, b.pickupAt)) set.pickupDate = set.pickupAt;
    if (sameInstant(b.dropDate, b.dropAt)) set.dropDate = set.dropAt;
    if (Array.isArray(b.extensions) && b.extensions.length) {
      set.extensions = b.extensions.map((e: Record<string, unknown>) => ({
        ...e,
        previousDropAt: shift(e.previousDropAt as Date),
        newDropAt: shift(e.newDropAt as Date),
      }));
    }
    backup.push({ _id: b._id, bookingId: b.bookingId, pickupAt: b.pickupAt, dropAt: b.dropAt, pickupDate: b.pickupDate, dropDate: b.dropDate, extensions: b.extensions });
    ops.push({ updateOne: { filter: { _id: b._id }, update: { $set: set } } });
    console.log(`${b.bookingId}: ${b.pickupTime}→${b.dropTime}  ${b.pickupAt.toISOString()} → ${(set.pickupAt as Date).toISOString()}`);
  }

  console.log(`\n${docs.length} bookings checked, ${ops.length} to fix, ${mixed} skipped.`);
  if (apply && ops.length) {
    const file = `booking-timezone-backup-${Date.now()}.json`;
    writeFileSync(file, JSON.stringify(backup, null, 2));
    const res = await Booking.collection.bulkWrite(ops);
    console.log(`Backup: ${file}. Updated ${res.modifiedCount} bookings.`);
  } else if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply.");
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
