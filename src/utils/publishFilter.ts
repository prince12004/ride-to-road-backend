import { ContentStatus } from "../types/enums";

/**
 * Published content whose publish time has arrived. A PUBLISHED post with a
 * future publishedAt is "scheduled": it stays hidden until that moment.
 */
export function livePublishedFilter() {
  return {
    status: ContentStatus.PUBLISHED,
    $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }],
  };
}
