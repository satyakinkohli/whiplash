import { describe, it, expect } from 'vitest';
import { dedupe, dedupeKey } from '../src/dedupe.js';
import type { NormalizedRawEvent } from '../src/normalize.js';

function rawEvent(
  partial: Partial<NormalizedRawEvent> & {
    source_id: string;
    artist_normalized: string;
    date: string;
  },
): NormalizedRawEvent {
  return {
    source_id: partial.source_id,
    source_provenance: 'static-html',
    external_id: `${partial.source_id}-${partial.artist_normalized}-${partial.date}`,
    source_url: 'https://example.com/',
    artist: partial.artist ?? partial.artist_normalized,
    venue: partial.venue ?? null,
    city: partial.city ?? 'mumbai',
    date: partial.date,
    end_date: partial.end_date ?? null,
    ticket_url: partial.ticket_url ?? null,
    genre_hint: partial.genre_hint ?? null,
    type: partial.type ?? 'concert',
    fetched_at: '2026-04-26T00:00:00.000Z',
    confidence: partial.confidence ?? 1,
    raw_snippet: null,
    artist_normalized: partial.artist_normalized,
    venue_normalized: partial.venue_normalized ?? null,
  };
}

describe('dedupeKey', () => {
  it('produces same key for same canonical inputs', () => {
    const a = dedupeKey({
      artist_normalized: 'scorpions',
      venue_normalized: 'jio world garden',
      city: 'mumbai',
      date: '2026-04-30',
    });
    const b = dedupeKey({
      artist_normalized: 'scorpions',
      venue_normalized: 'jio world garden',
      city: 'mumbai',
      date: '2026-04-30',
    });
    expect(a).toBe(b);
  });

  it('produces different keys for different cities', () => {
    const a = dedupeKey({
      artist_normalized: 'scorpions',
      venue_normalized: null,
      city: 'mumbai',
      date: '2026-04-30',
    });
    const b = dedupeKey({
      artist_normalized: 'scorpions',
      venue_normalized: null,
      city: 'bengaluru',
      date: '2026-04-26',
    });
    expect(a).not.toBe(b);
  });
});

describe('dedupe', () => {
  it('merges identical events from two sources', () => {
    const events = [
      rawEvent({
        source_id: 'rsi',
        artist: 'Scorpions',
        artist_normalized: 'scorpions',
        venue: 'Jio World Garden, BKC',
        venue_normalized: 'jio world garden bkc',
        city: 'mumbai',
        date: '2026-04-30',
        ticket_url: null,
      }),
      rawEvent({
        source_id: 'stayvista',
        artist: 'Scorpions',
        artist_normalized: 'scorpions',
        venue: 'Jio World Garden, BKC',
        venue_normalized: 'jio world garden bkc',
        city: 'mumbai',
        date: '2026-04-30',
        ticket_url: 'https://in.bookmyshow.com/.../scorpions',
      }),
    ];
    const result = dedupe(events);
    expect(result).toHaveLength(1);
    expect(result[0]!.sources).toHaveLength(2);
    // Ticket URL should be filled in from the source that had it
    expect(result[0]!.ticket_url).toBe('https://in.bookmyshow.com/.../scorpions');
  });

  it('does not merge same artist on different dates', () => {
    const events = [
      rawEvent({
        source_id: 'rsi',
        artist_normalized: 'scorpions',
        city: 'mumbai',
        date: '2026-04-30',
      }),
      rawEvent({
        source_id: 'rsi',
        artist_normalized: 'scorpions',
        city: 'bengaluru',
        date: '2026-04-26',
      }),
    ];
    const result = dedupe(events);
    expect(result).toHaveLength(2);
  });

  it('folds venueless rows into venueful ones with same artist+date+city', () => {
    const events = [
      rawEvent({
        source_id: 'rsi',
        artist_normalized: 'scorpions',
        venue: 'Jio World Garden',
        venue_normalized: 'jio world garden',
        city: 'mumbai',
        date: '2026-04-30',
      }),
      rawEvent({
        source_id: 'stayvista',
        artist_normalized: 'scorpions',
        venue: null,
        venue_normalized: null,
        city: 'mumbai',
        date: '2026-04-30',
      }),
    ];
    const result = dedupe(events);
    expect(result).toHaveLength(1);
    expect(result[0]!.venue_normalized).toBe('jio world garden');
    expect(result[0]!.sources).toHaveLength(2);
  });

  it('prefers festival over concert when sources disagree', () => {
    const events = [
      rawEvent({
        source_id: 'rsi',
        artist_normalized: 'budx nba house',
        venue_normalized: 'bharat mandapam',
        city: 'delhi',
        date: '2026-05-09',
        type: 'concert',
      }),
      rawEvent({
        source_id: 'district',
        artist_normalized: 'budx nba house',
        venue_normalized: 'bharat mandapam',
        city: 'delhi',
        date: '2026-05-09',
        type: 'festival',
      }),
    ];
    const result = dedupe(events);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('festival');
  });
});
