/**
 * Source: District (district.in) — ticketing, Zomato-owned.
 *
 * URL: https://district.in/events/<city>
 * SPA. Initial fetch returns empty shell. Listings hydrate via JWT-signed
 * API calls; XHR interception likely requires capturing a session cookie
 * first, which makes Playwright rendering the more practical default here.
 *
 * STATUS: stub.
 *
 * TODO:
 *   1. Use ./_browser.ts to open the city listing page.
 *   2. Wait for the events grid to hydrate.
 *   3. Scroll to load more (infinite scroll on most cities).
 *   4. Scrape: title, date, venue, slug → ticket URL.
 *   5. Investigate whether the JWT can be reused across runs (probably not —
 *      typically rotates per session). If yes, switch to direct API calls.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const district: Source = {
  id: 'district',
  provenance: 'headless',
  displayName: 'District',
  timeoutMs: 90_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    ctx.log('warn', 'district source not yet implemented; returning []');
    return [];
  },
};

export default district;
