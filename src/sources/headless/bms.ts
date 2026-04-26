/**
 * Source: BookMyShow — ticketing.
 *
 * URL: https://in.bookmyshow.com/explore/events-<city>
 * BMS event listing pages are React SPAs. Direct GET returns an empty shell.
 *
 * Strategy: try XHR interception first.
 *   - The listing page makes a GraphQL/REST call to fetch events. Open
 *     devtools → Network, find the call, replicate it with the right headers
 *     (User-Agent, Accept-Language, x-bms-id, etc.). Document the call
 *     signature in this file's header comment when we figure it out.
 *   - If signed headers / Cloudflare make direct calls infeasible, fall back
 *     to Playwright rendering using ./_browser.ts.
 *
 * STATUS: stub. Currently returns [] with a warning. The XHR investigation
 * is the next thing to do here.
 *
 * Per-page cadence: hourly for events ≤30 days out, daily for events
 * 30–90 days out. Implemented via a simple TTL cache; not in v0.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const bms: Source = {
  id: 'bms',
  provenance: 'headless',
  displayName: 'BookMyShow',
  timeoutMs: 60_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    ctx.log('warn', 'bms source not yet implemented; returning []');
    // When implementing:
    //   1. Investigate XHR — likely a POST to in.bookmyshow.com/api/explore
    //      or similar with city + category=music.
    //   2. If clean: hit it directly with `fetch` and the required headers.
    //   3. If signed: use newPage() from ./_browser.ts, navigate, wait for
    //      [data-testid="event-card"] selector, scrape DOM.
    //   4. For each card, follow to detail page for ticket_url + venue.
    return [];
  },
};

export default bms;
