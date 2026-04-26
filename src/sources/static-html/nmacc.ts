/**
 * Source: NMACC (Nita Mukesh Ambani Cultural Centre) — Mumbai venue.
 *
 * URL: https://www.nmacc.com/performing-arts/
 * Static HTML with a clean event grid. One of the higher-quality venue sites
 * in India, layout has been stable.
 *
 * STATUS: stub. Selector parse is straightforward once we open the page in
 * a browser and pick the right selectors.
 *
 * TODO:
 *   1. Fetch /performing-arts/ index.
 *   2. Parse each event card: artist (often the show title), date, venue
 *      (NMACC has multiple halls — Grand Theatre, Studio Theatre, The Cube).
 *   3. Filter to music-only (NMACC also lists theatre, dance, etc.).
 *   4. Follow event detail URL for ticket link if not on index.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const nmacc: Source = {
  id: 'nmacc',
  provenance: 'static-html',
  displayName: 'NMACC (Mumbai)',
  timeoutMs: 30_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    ctx.log('warn', 'nmacc source not yet implemented; returning []');
    return [];
  },
};

export default nmacc;
