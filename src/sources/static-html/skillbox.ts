/**
 * Source: Skillbox — ticketing platform leaning indie/metal/electronic.
 *
 * URL: https://www.skillboxes.com/events/ + /city/<city>
 * Mostly static HTML for event-detail pages. Listings page may use minor JS
 * but loads enough on initial render to scrape statically.
 *
 * Skillbox has the widest coverage of metal/indie/underground inventory in
 * Mumbai and Bengaluru — events that rarely make it onto BMS or RSI.
 *
 * STATUS: stub.
 *
 * TODO:
 *   1. Hit /events?city=mumbai (and delhi, bengaluru) listings.
 *   2. For each card: extract slug, hit /events/<slug> for full detail.
 *   3. Cache slug → external_id mapping so we don't re-fetch event pages
 *      whose data hasn't changed.
 *   4. Type: most are concerts; multi-act bills with their own poster
 *      treatment are usually still tagged concert here, not festival.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const skillbox: Source = {
  id: 'skillbox',
  provenance: 'static-html',
  displayName: 'Skillbox',
  timeoutMs: 60_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    ctx.log('warn', 'skillbox source not yet implemented; returning []');
    return [];
  },
};

export default skillbox;
