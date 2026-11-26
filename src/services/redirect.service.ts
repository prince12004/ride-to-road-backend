import { Redirect } from "../models/Redirect";
import { ApiError } from "../utils/ApiError";

/** Paths the redirect layer never touches, so admins can't lock themselves out. */
const PROTECTED_PREFIXES = ["/admin", "/api", "/_next", "/revalidate"];

/**
 * Normalises a site path: leading slash, no query/hash, no trailing slash
 * (except the root). Accepts a full URL on this site and keeps only its path.
 */
export function normalizePath(input: string): string {
  let value = String(input ?? "").trim();
  if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
  value = value.split(/[?#]/)[0];
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value;
}

/** A redirect target may be a site path or an absolute http(s) URL. */
export function normalizeTarget(input: string): string {
  const value = String(input ?? "").trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).toString();
    } catch {
      throw new ApiError(400, "Redirect target is not a valid URL.");
    }
  }
  return normalizePath(value);
}

export function assertRedirectable(from: string) {
  if (from === "/") throw new ApiError(400, "The home page can't be redirected.");
  if (PROTECTED_PREFIXES.some((p) => from === p || from.startsWith(`${p}/`))) {
    throw new ApiError(400, `Paths under ${PROTECTED_PREFIXES.join(", ")} can't be redirected.`);
  }
}

/**
 * Rejects a redirect that would loop: following `to` through the existing
 * active redirects must never come back to `from`.
 */
export async function assertNoLoop(from: string, to: string, ignoreId?: string) {
  if (from === to) throw new ApiError(400, "A redirect can't point to itself.");
  const seen = new Set([from]);
  let current = to;
  for (let hop = 0; hop < 20; hop++) {
    if (!current.startsWith("/")) return; // external URL ends the chain
    const next = await Redirect.findOne({ from: current, isActive: true, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }).lean();
    if (!next) return;
    if (seen.has(next.to)) throw new ApiError(400, `This would create a redirect loop via ${current}.`);
    seen.add(current);
    current = next.to;
  }
  throw new ApiError(400, "Redirect chain is too long.");
}

/**
 * Called when a published page's slug changes: the old URL permanently
 * redirects to the new one, chains are flattened, and a stale redirect away
 * from the new URL (from an earlier rename back) is removed.
 */
export async function recordSlugChange(prefix: string, oldSlug: string, newSlug: string) {
  if (!oldSlug || !newSlug || oldSlug === newSlug) return;
  const from = normalizePath(`${prefix}/${oldSlug}`);
  const to = normalizePath(`${prefix}/${newSlug}`);

  await Redirect.deleteMany({ from: to });
  await Redirect.updateMany({ to: from }, { to });
  await Redirect.findOneAndUpdate(
    { from },
    { from, to, statusCode: 301, isActive: true, note: "Auto-created: URL slug changed" },
    { upsert: true, setDefaultsOnInsert: true }
  );
}
