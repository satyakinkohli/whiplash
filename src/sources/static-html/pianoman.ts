/**
 * Source: The Piano Man — Delhi/NCR jazz venue chain.
 *
 * URL: https://www.thepianoman.in/
 * Static HTML. Two locations: Safdarjung Enclave and Eldeco Centre, Gurugram.
 *
 * STATUS: stub.
 *
 * TODO:
 *   1. Find the events index URL (currently published as a calendar widget
 *      embedded on the home page).
 *   2. Parse the calendar widget output. May need LLM fallback because the
 *      widget renders dates/artists in a non-standard structure.
 *   3. Map venue to one of the two known halls; city to delhi or gurugram.
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const pianoman: Source = {
  id: 'pianoman',
  provenance: 'static-html',
  displayName: 'The Piano Man (Delhi/Gurugram)',
  timeoutMs: 20_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    ctx.log('warn', 'pianoman source not yet implemented; returning []');
    return [];
  },
};

export default pianoman;
