import { formatShortId } from '../copy/format';

const READABLE_ID = /^#FG-[A-Z]+-\d+$/i;
const SHORT_ENOUGH = 32;

/**
 * Display form of an ID. Readable IDs from the backend ("#FG-STREAM-12") stay whole, long
 * machine IDs use the one short form (first 6, "…", last 6). The full value stays in the data.
 */
export function formatLogicalId(value: string | null | undefined): string {
  const id = String(value || '').trim();
  if (!id || READABLE_ID.test(id) || id.length <= SHORT_ENOUGH) return id;
  return formatShortId(id);
}
