/**
 * Source: Bandsintown — international touring artist database, broader than
 * Songkick in some genres (electronic, indie, hip-hop).
 *
 * Public API requires only an app_id. No payment.
 *
 * STATUS: stub.
 *
 * TODO:
 *   1. Maintain a list of artists we want to track (auto-grown from approved
 *      events over time).
 *   2. For each artist, GET /artists/<name>/events?app_id=<id>.
 *   3. Filter to in-scope cities.
 *   4. Map → RawEvent. Use the bandsintown event id as external_id.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const bandsintown: Source = {
  id: 'bandsintown',
  provenance: 'api',
  displayName: 'Bandsintown',
  timeoutMs: 60_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    if (!process.env.BANDSINTOWN_APP_ID) {
      ctx.log('info', 'BANDSINTOWN_APP_ID not set; skipping');
      return [];
    }
    ctx.log('warn', 'bandsintown source not yet implemented; returning []');
    return [];
  },
};

export default bandsintown;
