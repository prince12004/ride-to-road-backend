import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

/**
 * Which public data each admin area feeds. Tags must match the ones used by
 * the frontend's fetches in frontend/src/lib/content.ts.
 */
const TAGS_BY_ADMIN_PATH: [prefix: string, tags: string[]][] = [
  ["/cars", ["cars"]],
  ["/locations", ["locations", "cars"]],
  ["/offers", ["offers"]],
  ["/testimonials", ["testimonials"]],
  ["/faqs", ["faqs"]],
  ["/journeys", ["journeys"]],
  ["/blogs", ["blogs"]],
  ["/blog-categories", ["blogs"]],
  // Booking rules (e.g. km allowance) are shown on car pages too.
  ["/cms", ["settings", "site-content", "cars"]],
];

/** Asks the Next.js site to drop cached data for these tags. Never throws. */
export async function revalidateFrontend(tags: string[]): Promise<void> {
  if (!tags.length || !env.frontendRevalidateUrl || !env.revalidateSecret) return;
  try {
    const res = await fetch(env.frontendRevalidateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": env.revalidateSecret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[revalidate] frontend responded ${res.status} for tags ${tags.join(",")}`);
  } catch (err) {
    console.error("[revalidate] could not reach frontend:", err instanceof Error ? err.message : err);
  }
}

/**
 * Admin-router middleware: once a create/update/delete succeeds, refresh the
 * public pages that show that data — so admin changes appear on the website
 * immediately instead of after the cache expires.
 */
export function revalidateOnAdminWrite(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  // Read the path now: by the time "finish" fires, the nested router has
  // rewritten req.url relative to itself (e.g. "/faqs/123" -> "/123").
  const path = req.path;
  const match = TAGS_BY_ADMIN_PATH.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (!match) return next();
  res.on("finish", () => {
    if (res.statusCode < 400) void revalidateFrontend(match[1]);
  });
  next();
}
