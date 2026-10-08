import crypto from "crypto";
import { env } from "../config/env";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

export function generateOtp(): string {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export function getOtpExpiry(): Date {
  return new Date(Date.now() + OTP_TTL_MS);
}

export function getResendCooldownRemainingMs(lastRequestedAt?: Date): number {
  if (!lastRequestedAt) return 0;
  const elapsed = Date.now() - lastRequestedAt.getTime();
  return Math.max(0, RESEND_COOLDOWN_MS - elapsed);
}

export { MAX_OTP_ATTEMPTS };

/**
 * Sends the OTP over SMS. No SMS provider (MSG91 / Twilio / 2Factor / etc.)
 * is wired up yet, so in dev mode this just logs the code and the caller
 * returns it directly in the API response — clearly labeled as dev-only.
 * To go live: implement the real provider call here and flip OTP_DEV_MODE=false.
 */
export async function sendOtpSms(mobile: string, otp: string): Promise<{ devOtp?: string }> {
  if (env.otpDevMode) {
    console.log(`[otp:dev] OTP for +91${mobile} is ${otp} (valid 5 minutes)`);
    return { devOtp: otp };
  }

  throw new Error(
    "No SMS provider is configured. Set OTP_DEV_MODE=false only after implementing a real provider in services/otp.service.ts."
  );
}
