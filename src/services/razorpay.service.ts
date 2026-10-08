import crypto from "crypto";
import Razorpay from "razorpay";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new ApiError(
      500,
      "Online payment is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the backend .env (test keys from https://dashboard.razorpay.com/app/keys)."
    );
  }
  if (!client) {
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
}

export async function createRazorpayOrder(params: {
  amountInRupees: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ orderId: string; amount: number; currency: string }> {
  const rzp = getClient();
  const order = await rzp.orders.create({
    amount: Math.round(params.amountInRupees * 100), // paise
    currency: "INR",
    receipt: params.receipt,
    notes: params.notes,
  });
  return { orderId: order.id, amount: Number(order.amount), currency: order.currency };
}

export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const expected = crypto
    .createHmac("sha256", env.razorpay.keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  return expected === params.signature;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(env.razorpay.keyId && env.razorpay.keySecret);
}
