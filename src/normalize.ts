import type { City, RawEvent } from './schema.js';

/**
 * Normalize a RawEvent into a form suitable for dedupe + storage. Pure
 * functions only; no I/O. Tested in tests/normalize.test.ts.
 */

const CITY_ALIASES: Record<string, City> = {
  mumbai: 'mumbai',
  bombay: 'mumbai',
  bom: 'mumbai',

  delhi: 'delhi',
  'new delhi': 'delhi',
  ndelhi: 'delhi',
  ncr: 'delhi',

  bengaluru: 'bengaluru',
  bangalore: 'bengaluru',
  blr: 'bengaluru',

  gurugram: 'gurugram',
  gurgaon: 'gurugram',
  ggn: 'gurugram',
};

export function normalizeCity(input: string): City | null {
  const key = input.trim().toLowerCase();
  return CITY_ALIASES[key] ?? null;
}

/**
 * Canonicalize an artist name for dedupe matching. Case-folded, punctuation
 * stripped, "the " prefix removed, multi-artist separators collapsed.
 *
 * "The Beatles"  → "beatles"
 * "BLACKSTRATBLUES" → "blackstratblues"
 * "Hari & Sukhmani" → "hari sukhmani"
 * "Obscura, DVRK" → "obscura dvrk" (caller may want to split first)
 */
export function normalizeArtist(input: string): string {
  return input
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a multi-artist string into individual artist names. Handles the
 * common separators we see in editorial calendars: comma, slash, "with",
 * "feat./ft.", "&", "+", "vs".
 */
export function splitArtists(input: string): string[] {
  // Strip common parenthetical context first ("(Sun Eater Tour 2026)").
  const stripped = input.replace(/\(.*?\)/g, '').trim();
  // Don't split single-artist strings even if they contain "&" mid-name
  // (e.g., "Hari & Sukhmani" is a duo presented as one act). Heuristic:
  // only split when separators dominate.
  const separators = /(?:\s*[,/+]\s*|\s+(?:feat\.|ft\.|with|vs\.?)\s+)/i;
  const parts = stripped.split(separators).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [stripped];
}

/**
 * Canonicalize a venue name. Strips trailing city/area noise, collapses
 * whitespace, lowercases.
 *
 * "Tata Theatre, NCPA" → "tata theatre ncpa"
 * "antiSOCIAL Lower Parel" → "antisocial lower parel"
 */
export function normalizeVenue(input: string | null): string | null {
  if (!input) return null;
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a freeform date string into ISO YYYY-MM-DD. Handles formats common
 * in Indian gig listings:
 *   - "9 May 2026", "9th May 2026", "May 9 2026", "May 9, 2026"
 *   - "9 May" (assumes nearest future occurrence)
 *   - "2026-05-09" (passthrough)
 *
 * Returns null if it can't parse — caller decides whether to escalate to LLM.
 */
export function parseDate(input: string, today = new Date()): string | null {
  const s = input.trim();
  // ISO passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Strip ordinals
  const cleaned = s.replace(/(\d+)(st|nd|rd|th)/g, '$1');

  // Native parse handles "9 May 2026", "May 9, 2026", etc.
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  // No-year format like "9 May" — assume nearest future occurrence
  const noYearMatch = cleaned.match(
    /^(\d{1,2})\s+([a-z]+)$|^([a-z]+)\s+(\d{1,2})$/i,
  );
  if (noYearMatch) {
    const withYear = `${cleaned} ${today.getFullYear()}`;
    const tryThisYear = new Date(withYear);
    if (!isNaN(tryThisYear.getTime())) {
      // If parsed date is in the past, bump to next year
      const useDate =
        tryThisYear < today
          ? new Date(`${cleaned} ${today.getFullYear() + 1}`)
          : tryThisYear;
      return toIsoDate(useDate);
    }
  }

  return null;
}

function toIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Apply normalization to an entire RawEvent. Returns the same shape with
 * normalized fields available alongside (we don't overwrite display fields).
 */
export interface NormalizedRawEvent extends RawEvent {
  artist_normalized: string;
  venue_normalized: string | null;
}

export function normalizeRawEvent(raw: RawEvent): NormalizedRawEvent {
  return {
    ...raw,
    artist_normalized: normalizeArtist(raw.artist),
    venue_normalized: normalizeVenue(raw.venue),
  };
}
