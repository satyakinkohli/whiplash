import { createHash } from 'node:crypto';
import type { NormalizedRawEvent } from './normalize.js';

/**
 * Dedupe across sources within a single run.
 *
 * Two events are considered the same if they share normalized
 * (artist, venue, date, city). When a venue is unknown on one side, we fall
 * back to (artist, date, city) — same artist on the same day in the same city
 * is almost certainly the same show even if one source omitted the venue.
 *
 * The merge keeps the *richest* version of each field: a non-null venue
 * beats null, a real ticket_url beats null, a higher-confidence type wins.
 * Provenance is preserved as an array so the admin UI can show all sources.
 */

export type DedupeKey = string;

export interface MergedRawEvent {
  key: DedupeKey;
  artist_display: string;
  artist_normalized: string;
  venue_display: string | null;
  venue_normalized: string | null;
  city: NormalizedRawEvent['city'];
  date: string;
  end_date: string | null;
  type: NormalizedRawEvent['type'];
  ticket_url: string | null;
  genre_hint: string | null;
  sources: Array<{
    source_id: string;
    external_id: string;
    source_url: string;
    confidence: number;
    fetched_at: string;
  }>;
}

export function dedupeKey(input: {
  artist_normalized: string;
  venue_normalized: string | null;
  city: string;
  date: string;
}): DedupeKey {
  // Hash so the key is bounded length and safe to use as a primary key.
  const venuePart = input.venue_normalized ?? '__NO_VENUE__';
  const raw = [input.artist_normalized, venuePart, input.city, input.date].join('|');
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

/**
 * Two-pass dedupe. First pass groups by the strict key including venue;
 * second pass collapses any remaining (artist, date, city) collisions where
 * one side has venue=null.
 */
export function dedupe(events: NormalizedRawEvent[]): MergedRawEvent[] {
  const strict = new Map<DedupeKey, MergedRawEvent>();

  for (const raw of events) {
    const key = dedupeKey({
      artist_normalized: raw.artist_normalized,
      venue_normalized: raw.venue_normalized,
      city: raw.city,
      date: raw.date,
    });

    const existing = strict.get(key);
    if (!existing) {
      strict.set(key, toMerged(key, raw));
    } else {
      strict.set(key, mergeInto(existing, raw));
    }
  }

  // Second pass: collapse "venue=null" rows into matching "venue=X" rows
  // when the artist/date/city otherwise match.
  const byArtistDateCity = new Map<string, MergedRawEvent[]>();
  for (const ev of strict.values()) {
    const k = `${ev.artist_normalized}|${ev.city}|${ev.date}`;
    const arr = byArtistDateCity.get(k) ?? [];
    arr.push(ev);
    byArtistDateCity.set(k, arr);
  }

  const out: MergedRawEvent[] = [];
  for (const group of byArtistDateCity.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const venueful = group.filter((g) => g.venue_normalized !== null);
    const venueless = group.filter((g) => g.venue_normalized === null);

    if (venueful.length === 1 && venueless.length > 0) {
      // Fold all venueless into the single venueful event.
      let merged = venueful[0]!;
      for (const v of venueless) {
        merged = mergeMerged(merged, v);
      }
      out.push(merged);
    } else {
      // Either zero or multiple venueful — leave as-is and let the admin
      // queue surface the ambiguity.
      out.push(...group);
    }
  }
  return out;
}

function toMerged(key: DedupeKey, r: NormalizedRawEvent): MergedRawEvent {
  return {
    key,
    artist_display: r.artist,
    artist_normalized: r.artist_normalized,
    venue_display: r.venue,
    venue_normalized: r.venue_normalized,
    city: r.city,
    date: r.date,
    end_date: r.end_date,
    type: r.type,
    ticket_url: r.ticket_url,
    genre_hint: r.genre_hint,
    sources: [
      {
        source_id: r.source_id,
        external_id: r.external_id,
        source_url: r.source_url,
        confidence: r.confidence,
        fetched_at: r.fetched_at,
      },
    ],
  };
}

function mergeInto(existing: MergedRawEvent, r: NormalizedRawEvent): MergedRawEvent {
  return {
    ...existing,
    venue_display: existing.venue_display ?? r.venue,
    venue_normalized: existing.venue_normalized ?? r.venue_normalized,
    end_date: existing.end_date ?? r.end_date,
    ticket_url: existing.ticket_url ?? r.ticket_url,
    genre_hint: existing.genre_hint ?? r.genre_hint,
    // type: prefer 'festival' over 'concert' if any source flagged it
    type: existing.type === 'festival' || r.type === 'festival' ? 'festival' : 'concert',
    sources: [
      ...existing.sources,
      {
        source_id: r.source_id,
        external_id: r.external_id,
        source_url: r.source_url,
        confidence: r.confidence,
        fetched_at: r.fetched_at,
      },
    ],
  };
}

function mergeMerged(a: MergedRawEvent, b: MergedRawEvent): MergedRawEvent {
  return {
    ...a,
    venue_display: a.venue_display ?? b.venue_display,
    venue_normalized: a.venue_normalized ?? b.venue_normalized,
    end_date: a.end_date ?? b.end_date,
    ticket_url: a.ticket_url ?? b.ticket_url,
    genre_hint: a.genre_hint ?? b.genre_hint,
    type: a.type === 'festival' || b.type === 'festival' ? 'festival' : 'concert',
    sources: [...a.sources, ...b.sources],
  };
}
