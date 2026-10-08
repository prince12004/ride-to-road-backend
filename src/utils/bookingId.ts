import { getNextSequence } from "../models/Counter";

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function generateBookingId(): Promise<string> {
  const datePart = formatDate(new Date());
  const seq = await getNextSequence(`booking-${datePart}`);
  return `RTR-${datePart}-${String(seq).padStart(4, "0")}`;
}
