import { AdminUser } from "../models/AdminUser";
import { AdminRole, ADMIN_PERMISSION_MODULES } from "../types/enums";
import { env } from "../config/env";

export async function bootstrapSuperAdmin(): Promise<void> {
  const existingAdminCount = await AdminUser.countDocuments();
  if (existingAdminCount > 0) return;

  await AdminUser.create({
    name: "Super Admin",
    email: env.superAdminEmail,
    password: env.superAdminPassword,
    role: AdminRole.SUPER_ADMIN,
    permissions: [...ADMIN_PERMISSION_MODULES],
  });

  console.log(`[bootstrap] Created first Super Admin: ${env.superAdminEmail} (change the password after first login)`);
}
