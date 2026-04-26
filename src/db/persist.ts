import type { MergedRawEvent } from '../dedupe.js';
import { dedupeKey } from '../dedupe.js';
import { requireSupabase } from './client.js';

/**
 * Persist a run's merged events to Supabase.
 *
 * Logic:
 *   - Upsert each merged event by dedupe_key.
 *   - On insert: status=queued, first_seen_at=now, last_seen_at=now.
 *   - On update: refresh last_seen_at; if previously removed, clear removed_at.
 *   - For each event, upsert provenance rows into event_sources.
 *   - At the end of the run, mark events not seen this run as removed
 *     (soft-delete with removed_at = now). We only mark removed if a source
 *     that previously found it ran successfully — if a source errored, we
 *     don't conclude its prior events are gone.
 *
 * v0 implementation: upserts only. The "mark removed" pass is in a TODO at
 * the bottom because it requires tracking which sources ran successfully and
 * which prior events came from them — small but worth doing carefully.
 */

export interface PersistResult {
  new: number;
  updated: number;
  removed: number;
}

interface PersistOptions {
  runId: string;
}

export async function persist(
  events: MergedRawEvent[],
  opts: PersistOptions,
): Promise<PersistResult> {
  const supabase = requireSupabase();
  let nNew = 0;
  let nUpdated = 0;
  const now = new Date().toISOString();

  for (const ev of events) {
    const key = dedupeKey({
      artist_normalized: ev.artist_normalized,
      venue_normalized: ev.venue_normalized,
      city: ev.city,
      date: ev.date,
    });

    // Upsert the event row
    const { data: existing } = await supabase
      .from('events')
      .select('id, first_seen_at, removed_at')
      .eq('dedupe_key', key)
      .maybeSingle();

    if (!existing) {
      const { data: inserted, error: insertErr } = await supabase
        .from('events')
        .insert({
          dedupe_key: key,
          artist_display: ev.artist_display,
          artist_normalized: ev.artist_normalized,
          venue_display: ev.venue_display,
          venue_normalized: ev.venue_normalized,
          city: ev.city,
          date: ev.date,
          end_date: ev.end_date,
          type: ev.type,
          ticket_url: ev.ticket_url,
          status: 'queued',
          first_seen_at: now,
          last_seen_at: now,
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      await upsertSources(inserted!.id, ev, opts.runId);
      nNew++;
    } else {
      const { error: updateErr } = await supabase
        .from('events')
        .update({
          last_seen_at: now,
          removed_at: null,
          // Rich-field merge: only fill nulls. The display strings should
          // not regress to a worse version once we've seen a good one.
          ticket_url: ev.ticket_url,
          venue_display: ev.venue_display,
          venue_normalized: ev.venue_normalized,
          end_date: ev.end_date,
          type: ev.type,
        })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
      await upsertSources(existing.id, ev, opts.runId);
      nUpdated++;
    }
  }

  // TODO(v0.1): mark events whose sources all ran successfully but didn't
  // emit them this run as removed. Requires per-source success tracking from
  // pipeline.ts handed in via opts.
  const nRemoved = 0;

  return { new: nNew, updated: nUpdated, removed: nRemoved };
}

async function upsertSources(
  eventId: string,
  ev: MergedRawEvent,
  runId: string,
): Promise<void> {
  const supabase = requireSupabase();
  for (const src of ev.sources) {
    await supabase.from('event_sources').upsert(
      {
        event_id: eventId,
        source_id: src.source_id,
        external_id: src.external_id,
        source_url: src.source_url,
        confidence: src.confidence,
        last_run_id: runId,
        last_seen_at: src.fetched_at,
      },
      { onConflict: 'event_id,source_id' },
    );
  }
}
