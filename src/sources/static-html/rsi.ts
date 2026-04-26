/**
 * Source: Rolling Stone India — Upcoming Gig Calendar
 * URL: https://rollingstoneindia.com/gigscalendar/
 *
 * RSI publishes a single-page editorial gig calendar covering metros across
 * India. Their team updates it roughly weekly. The page is server-rendered
 * static HTML; no JS needed to read the listings.
 *
 * Strategy:
 *   1. Fetch the page with a polite User-Agent.
 *   2. Pre-narrow the HTML to the listings region (#main, .entry-content, etc.)
 *      so the LLM doesn't waste tokens on chrome.
 *   3. Try a Cheerio selector parse. RSI's structure has shifted historically;
 *      we keep multiple selector profiles and use whichever yields ≥1 row.
 *   4. If all profiles yield 0, escalate to LLM extraction.
 *   5. Filter to in-scope cities, drop past events, attach metadata, return.
 *
 * Future enrichment: cross-reference /category/gigcalendar/ articles for
 * artist bios and writeups to populate the consumer UI's event detail page.
 * Not in v0.
 */

import * as cheerio from 'cheerio';
import { z } from 'zod';
import {
  RawEventSchema,
  type RawEvent,
  type City,
  type EventType,
} from '../../schema.js';
import { normalizeCity, parseDate } from '../../normalize.js';
import { extractFromHtml } from '../../extractors/html-llm.js';
import type { Source, SourceContext } from '../_types.js';
import { createHash } from 'node:crypto';

const URL = 'https://rollingstoneindia.com/gigscalendar/';
const ID = 'rsi';

interface ParsedRow {
  artist: string;
  venue: string | null;
  city: string;
  date: string; // freeform, normalize.ts handles parsing
  end_date: string | null;
  ticket_url: string | null;
  type: EventType;
  genre_hint: string | null;
  confidence: number;
  raw_snippet: string;
}

const rsi: Source = {
  id: ID,
  provenance: 'static-html',
  displayName: 'Rolling Stone India',
  timeoutMs: 30_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    const html = await fetchHtml(ctx);
    const narrowed = narrowToListings(html);

    let parsed = parseWithSelectors(narrowed, ctx);
    ctx.log('info', `selector parse yielded ${parsed.length} rows`);

    if (parsed.length === 0) {
      ctx.log('warn', 'selector parse returned 0 rows — escalating to LLM');
      parsed = await parseWithLlm(narrowed, ctx);
      ctx.log('info', `LLM parse yielded ${parsed.length} rows`);
    }

    const today = ctx.startedAt.slice(0, 10);
    const out: RawEvent[] = [];
    for (const row of parsed) {
      const city = normalizeCity(row.city);
      if (!city) {
        ctx.log('info', `dropping row with out-of-scope city: ${row.city}`);
        continue;
      }
      const isoDate = parseDate(row.date);
      if (!isoDate) {
        ctx.log('warn', `unparseable date "${row.date}" for ${row.artist}`);
        continue;
      }
      if (isoDate < today) continue; // drop past events

      const endIso = row.end_date ? parseDate(row.end_date) : null;

      const candidate = {
        source_id: ID,
        source_provenance: 'static-html' as const,
        external_id: stableId({
          artist: row.artist,
          venue: row.venue,
          date: isoDate,
          city,
        }),
        source_url: URL,
        artist: row.artist,
        venue: row.venue,
        city,
        date: isoDate,
        end_date: endIso,
        ticket_url: row.ticket_url,
        genre_hint: row.genre_hint,
        type: row.type,
        fetched_at: ctx.startedAt,
        confidence: row.confidence,
        raw_snippet: row.raw_snippet,
      };
      const validated = RawEventSchema.safeParse(candidate);
      if (validated.success) {
        out.push(validated.data);
      } else {
        ctx.log('warn', 'row failed schema validation', {
          row,
          issues: validated.error.issues,
        });
      }
    }

    if (out.length === 0 && !ctx.dryRun) {
      // Hard signal: a successful fetch should never yield zero events from
      // a page that normally has dozens. The runner alerts on this.
      throw new Error(
        'RSI fetch+parse yielded 0 events; layout may have changed. Check fixtures.',
      );
    }
    return out;
  },
};

export default rsi;

/* -------------------------------------------------------------------------- */
/*                                 Internals                                  */
/* -------------------------------------------------------------------------- */

async function fetchHtml(ctx: SourceContext): Promise<string> {
  const ua = process.env.WHIPLASH_USER_AGENT ?? 'whiplash-pipeline';
  const resp = await fetch(URL, {
    headers: {
      'User-Agent': ua,
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    throw new Error(`RSI fetch failed: ${resp.status} ${resp.statusText}`);
  }
  const html = await resp.text();
  ctx.log('info', `fetched ${html.length} bytes`);
  return html;
}

/**
 * Narrow to the listings region. WordPress sites typically wrap article body
 * in .entry-content or #main. We try a few in order; if none match, we hand
 * the full page to the LLM and let it find the listings itself.
 */
function narrowToListings(html: string): string {
  const $ = cheerio.load(html);
  for (const selector of ['.entry-content', '#main article', '#content', 'main']) {
    const region = $(selector).first();
    if (region.length && region.text().trim().length > 200) {
      return region.html() ?? html;
    }
  }
  return html;
}

/**
 * Selector-based parse. RSI has used at least three layouts historically:
 *   - GigPress plugin (current, 2026-04): one <tr> per event with 4 <td>:
 *     date | artist | city | venue, then a sibling <tr> with the Buy Tickets <a>.
 *   - Tables / WP gig-calendar plugin output with .gig-row, .gig-date classes.
 *   - Plain <p> blocks with <strong>artist</strong> followed by date/venue.
 *
 * We try each profile and use whichever yields ≥1 row. When RSI changes
 * layout, the LLM fallback kicks in and we add a new profile here.
 */
function parseWithSelectors(html: string, ctx: SourceContext): ParsedRow[] {
  const $ = cheerio.load(html);

  // e.g. "April 24th, 2026" or "May 7th, 2026 - May 9th, 2026"
  const RSI_DATE_RE =
    /^\s*([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})(?:\s*[-–]\s*([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}))?\s*$/;

  const profiles: Array<() => ParsedRow[]> = [
    // Profile A: GigPress table layout (current as of 2026-04).
    // <tr><td>date</td><td>artist</td><td>city</td><td>venue</td></tr>
    // followed by a sibling <tr> containing the Buy Tickets <a>.
    () => {
      const rows: ParsedRow[] = [];
      $('tr').each((_, el) => {
        const $el = $(el);
        const cells = $el.find('td');
        if (cells.length < 4) return;

        const dateText = $(cells[0]).text().trim();
        const m = dateText.match(RSI_DATE_RE);
        if (!m) return; // skip header / separator / buy-ticket rows

        const artist = $(cells[1]).text().trim();
        const city = $(cells[2]).text().trim();
        const venue = $(cells[3]).text().trim();
        if (!artist || !city || !venue) return;

        // Buy Tickets link sits in the next <tr> (or sometimes inline).
        const $next = $el.next('tr');
        const ticketUrl =
          $next.find('a[href]').first().attr('href') ??
          $el.find('a[href]').first().attr('href') ??
          null;

        rows.push({
          artist,
          venue,
          city,
          date: m[1]!,
          end_date: m[2] ?? null,
          ticket_url: ticketUrl,
          type: 'concert',
          genre_hint: null,
          confidence: 1,
          raw_snippet: $.html(el).slice(0, 500),
        });
      });
      return rows;
    },

    // Profile B: gig-row / gig-date class pattern (legacy RSI).
    () => {
      const rows: ParsedRow[] = [];
      $('.gig-row, [class*="gig-row"]').each((_, el) => {
        const $el = $(el);
        const artist = $el.find('.gig-artist, [class*="artist"]').first().text().trim();
        const date = $el.find('.gig-date, [class*="date"]').first().text().trim();
        const venue = $el.find('.gig-venue, [class*="venue"]').first().text().trim();
        const city = $el.find('.gig-city, [class*="city"]').first().text().trim();
        const link = $el.find('a').attr('href') ?? null;
        if (!artist || !date) return;
        rows.push({
          artist,
          venue: venue || null,
          city: city || splitVenueCity(venue).city,
          date,
          end_date: null,
          ticket_url: link,
          type: 'concert',
          genre_hint: null,
          confidence: 1,
          raw_snippet: $.html(el).slice(0, 500),
        });
      });
      return rows;
    },

    // Profile C: <strong>Artist</strong> followed by date/venue text (legacy RSI).
    () => {
      const rows: ParsedRow[] = [];
      $('p').each((_, el) => {
        const $el = $(el);
        const $strong = $el.find('strong, b').first();
        const artist = $strong.text().trim();
        if (!artist) return;
        const after = $el.text().replace(artist, '').trim();
        const dateMatch = after.match(
          /(\d{1,2}(?:st|nd|rd|th)?\s+\w+(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})/,
        );
        if (!dateMatch) return;
        const date = dateMatch[1]!;
        const remainder = after.replace(date, '').replace(/^[,\s|–-]+/, '').trim();
        const { venue, city } = splitVenueCity(remainder);
        const link =
          $el.find('a').attr('href') ?? $strong.find('a').attr('href') ?? null;
        rows.push({
          artist,
          venue,
          city,
          date,
          end_date: null,
          ticket_url: link,
          type: 'concert',
          genre_hint: null,
          confidence: 0.9,
          raw_snippet: $.html(el).slice(0, 500),
        });
      });
      return rows;
    },
  ];

  for (const profile of profiles) {
    const rows = profile();
    if (rows.length > 0) {
      ctx.log('info', `selector profile matched, ${rows.length} rows`);
      return rows;
    }
  }
  return [];
}

async function parseWithLlm(
  html: string,
  ctx: SourceContext,
): Promise<ParsedRow[]> {
  if (ctx.dryRun) {
    ctx.log('info', 'dry-run: skipping LLM extractor call');
    return [];
  }
  const today = ctx.startedAt.slice(0, 10);
  const result = await extractFromHtml({
    html,
    sourceHint: 'Rolling Stone India editorial gig calendar (rollingstoneindia.com/gigscalendar/)',
    cutoffDate: today,
  });
  ctx.log('info', `LLM extractor used ${result.model}`, { usage: result.usage });
  return result.rows.map((r) => ({
    artist: r.artist,
    venue: r.venue,
    city: r.city,
    date: r.date,
    end_date: r.end_date,
    ticket_url: r.ticket_url,
    type: r.type,
    genre_hint: r.genre_hint,
    confidence: r.confidence,
    raw_snippet: '', // LLM output is the snippet
  }));
}

function splitVenueCity(text: string): { venue: string | null; city: string } {
  if (!text) return { venue: null, city: '' };
  // Common patterns: "Venue Name, City" or "Venue Name | City"
  const parts = text.split(/[,|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      venue: parts.slice(0, -1).join(', '),
      city: parts[parts.length - 1]!,
    };
  }
  // No separator: treat the whole thing as venue with unknown city.
  return { venue: text, city: '' };
}

function stableId(input: {
  artist: string;
  venue: string | null;
  date: string;
  city: City;
}): string {
  const raw = [input.artist, input.venue ?? '', input.date, input.city]
    .map((s) => s.toLowerCase())
    .join('|');
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

// Re-export the schema for tests that want to construct fixture rows.
export const _testing = { stableId, splitVenueCity, narrowToListings, RawEventSchema: z };
