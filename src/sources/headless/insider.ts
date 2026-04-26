/**
 * Source: Paytm Insider (insider.in) — ticketing.
 *
 * URL: https://insider.in/<city>/events
 * SPA. Strategy similar to BMS — XHR interception first, Playwright fallback.
 *
 * STATUS: stub.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const insider: Source = {
  id: 'insider',
  provenance: 'headless',
  displayName: 'Paytm Insider',
  timeoutMs: 90_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    ctx.log('warn', 'insider source not yet implemented; returning []');
    return [];
  },
};

export default insider;
