/**
 * Source: Songkick — international touring artist database.
 *
 * Songkick has a public-ish API that requires an API key. Last we checked,
 * the free tier was narrowed but keys are still issuable on request. For
 * production we may need a partnership conversation; v0 can run with a
 * personal-tier key.
 *
 * Coverage: thin in India (5–10% of actual concert volume in our metros) but
 * strong on international touring artists when they announce India dates.
 * Treat as a high-precision, low-recall supplement.
 *
 * STATUS: stub.
 *
 * TODO:
 *   1. Read SONGKICK_API_KEY from env.
 *   2. For each in-scope city, query their metro_areas endpoint to get
 *      metro IDs (one-time bootstrap, cache in db).
 *   3. Daily: GET /api/3.0/metro_areas/<id>/calendar.json — paginate.
 *   4. Map each event JSON → RawEvent. Use Songkick's stable event id as
 *      external_id.
 *   5. Cache aggressively (12h TTL) — most queries return mostly the same set.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const songkick: Source = {
  id: 'songkick',
  provenance: 'api',
  displayName: 'Songkick',
  timeoutMs: 30_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    if (!process.env.SONGKICK_API_KEY) {
      ctx.log('info', 'SONGKICK_API_KEY not set; skipping');
      return [];
    }
    ctx.log('warn', 'songkick source not yet implemented; returning []');
    return [];
  },
};

export default songkick;
