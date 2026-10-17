import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUri: required("MONGO_URI"),

  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),

  adminJwtAccessSecret: required("ADMIN_JWT_ACCESS_SECRET"),
  adminJwtRefreshSecret: required("ADMIN_JWT_REFRESH_SECRET"),

  cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  },
  // Razorpay checkout stays off until explicitly enabled; bookings use
  // Cash on Delivery / UPI QR in the meantime.
  paymentGatewayEnabled: process.env.PAYMENT_GATEWAY_ENABLED === "true",

  defaultWhatsappNumber: process.env.DEFAULT_WHATSAPP_NUMBER ?? "917303939372",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  // On-demand revalidation of the Next.js site after admin changes. Both
  // must be set (and REVALIDATE_SECRET must match the frontend) to enable it.
  frontendRevalidateUrl: process.env.FRONTEND_REVALIDATE_URL ?? "",
  revalidateSecret: process.env.REVALIDATE_SECRET ?? "",

  superAdminEmail: process.env.SUPER_ADMIN_EMAIL ?? "admin@ridetoroad.com",
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? "ChangeMe123!",

  otpDevMode: (process.env.OTP_DEV_MODE ?? "true") === "true",

  isProd: (process.env.NODE_ENV ?? "development") === "production",
};
