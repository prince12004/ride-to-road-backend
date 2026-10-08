export enum AdminRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  CONTENT_MANAGER = "CONTENT_MANAGER",
  BOOKING_MANAGER = "BOOKING_MANAGER",
}

export const ADMIN_PERMISSION_MODULES = [
  "dashboard",
  "cars",
  "bookings",
  "customers",
  "coupons",
  "offers",
  "blogs",
  "locations",
  "faqs",
  "testimonials",
  "contact",
  "cms",
  "settings",
  "users",
  "activityLogs",
] as const;
export type AdminPermissionModule = (typeof ADMIN_PERMISSION_MODULES)[number];

export enum CarStatus {
  AVAILABLE = "AVAILABLE",
  BOOKED = "BOOKED",
  MAINTENANCE = "MAINTENANCE",
  INACTIVE = "INACTIVE",
}

export enum CarCategory {
  HATCHBACK = "hatchback",
  SEDAN = "sedan",
  SUV = "suv",
  LUXURY = "luxury",
}

export enum FuelType {
  PETROL = "Petrol",
  DIESEL = "Diesel",
  CNG = "CNG",
  ELECTRIC = "Electric",
}

export enum TransmissionType {
  MANUAL = "Manual",
  AUTOMATIC = "Automatic",
}

// Booking lifecycle. A booking is created the instant the user starts
// checkout (PAYMENT_PENDING) so an abandoned/failed Razorpay payment still
// leaves a real, follow-up-able record for the admin team.
export enum BookingStatus {
  PAYMENT_PENDING = "PAYMENT_PENDING",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  CONFIRMED = "CONFIRMED",
  CAR_ASSIGNED = "CAR_ASSIGNED",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

// Statuses that "hold" a car for overlap/availability purposes.
export const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.CAR_ASSIGNED,
  BookingStatus.ACTIVE,
];

export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  NOT_APPLICABLE = "NOT_APPLICABLE",
}

export enum PaymentMethod {
  RAZORPAY = "RAZORPAY",
  OFFLINE_CASH = "OFFLINE_CASH",
  OFFLINE_UPI = "OFFLINE_UPI",
  OFFLINE_OTHER = "OFFLINE_OTHER",
}

export enum BookingSource {
  ONLINE = "ONLINE",
  ADMIN_OFFLINE = "ADMIN_OFFLINE",
}

export enum VerificationStatus {
  NOT_SUBMITTED = "NOT_SUBMITTED",
  PENDING = "PENDING",
  VERIFIED = "VERIFIED",
  REJECTED = "REJECTED",
}

export enum DiscountType {
  PERCENTAGE = "PERCENTAGE",
  FIXED = "FIXED",
}

export enum ContentStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
}

export enum EnquiryStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  RESOLVED = "RESOLVED",
}
