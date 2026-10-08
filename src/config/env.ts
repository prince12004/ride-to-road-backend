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

  defaultWhatsappNumber: process.env.DEFAULT_WHATSAPP_NUMBER ?? "919310811124",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  superAdminEmail: process.env.SUPER_ADMIN_EMAIL ?? "admin@ridetoroad.com",
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? "ChangeMe123!",

  otpDevMode: (process.env.OTP_DEV_MODE ?? "true") === "true",

  isProd: (process.env.NODE_ENV ?? "development") === "production",
};
