/**
 * Source: StayVista — monthly editorial roundup of "Best Concerts in India".
 *
 * Roughly monthly cadence, listicle format, covers headliners and major shows
 * across metros. Static HTML, easy fetch.
 *
 * STATUS: stub. The fetch+parse hasn't been implemented yet because StayVista
 * publishes on a separate URL each month (.../best-concerts-in-india-may-2026/),
 * so this source needs a "find the latest article" step before the parse.
 *
 * TODO:
 *   1. Discover latest article URL (their /blog/ index + filter for the title pattern).
 *   2. Fetch + Cheerio parse the listicle. Each event is usually a <h2>/<h3>
 *      heading with artist + date, followed by venue/city in prose.
 *   3. LLM fallback (their structure is loose enough that LLM may be the
 *      primary parser, not the fallback).
 */

import type { RawEvent } from '../../schema.js';
import type { Source, SourceContext } from '../_types.js';

const stayvista: Source = {
  id: 'stayvista',
  provenance: 'static-html',
  displayName: 'StayVista monthly roundup',
  timeoutMs: 20_000,

  async fetch(ctx: SourceContext): Promise<RawEvent[]> {
    ctx.log('warn', 'stayvista source not yet implemented; returning []');
    return [];
  },
};

export default stayvista;
