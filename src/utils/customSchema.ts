import { ApiError } from "./ApiError";

const MAX_LENGTH = 20_000;

/**
 * Validates admin-entered JSON-LD: empty, or a JSON object / array of objects.
 * Returns it re-serialised (pretty) so what is stored is always valid JSON.
 */
export function normalizeCustomSchema(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  if (raw.length > MAX_LENGTH) throw new ApiError(400, "Custom schema is too long (max 20,000 characters).");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Custom schema must be valid JSON (paste only the JSON, without <script> tags).");
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (!items.length || !items.every((i) => i && typeof i === "object" && !Array.isArray(i))) {
    throw new ApiError(400, "Custom schema must be a JSON object, or an array of objects.");
  }
  return JSON.stringify(parsed, null, 2);
}
