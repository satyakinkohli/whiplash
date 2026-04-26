import { z } from 'zod';

/**
 * Cities currently in scope. Adding a new city requires a code change so we
 * can wire its source list deliberately rather than letting noise through.
 */
export const CitySchema = z.enum(['mumbai', 'delhi', 'bengaluru', 'gurugram']);
export type City = z.infer<typeof CitySchema>;

export const EventTypeSchema = z.enum(['concert', 'festival']);
export type EventType = z.infer<typeof EventTypeSchema>;

export const SourceProvenanceSchema = z.enum([
  'static-html',
  'headless',
  'api',
  'vision',
]);
export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;

/**
 * RawEvent: what a source emits before normalization. Deliberately permissive —
 * sources are dumb extractors, normalize.ts is where canonicalization happens.
 *
 * The (source_id + external_id) tuple is unique per source. external_id is the
 * source's own stable identifier when it has one (Songkick event id, BMS event
 * slug, etc.); when it doesn't, sources synthesize a stable hash of
 * (artist + venue + date) so reruns produce the same id.
 */
export const RawEventSchema = z.object({
  source_id: z.string(), // e.g. 'rsi', 'bms', 'songkick'
  source_provenance: SourceProvenanceSchema,
  external_id: z.string(), // stable per (source_id, event)
  source_url: z.string().url(),

  artist: z.string().min(1),
  // Sometimes a single row contains multiple artists ("Obscura, DVRK"). Sources
  // can either split into multiple rows or pass the joined string through and
  // let normalize.ts handle the split.
  venue: z.string().nullable(),
  city: CitySchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date (no time)
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ticket_url: z.string().url().nullable(),
  genre_hint: z.string().nullable(), // freeform string from source if any
  type: EventTypeSchema,

  fetched_at: z.string().datetime(),
  // Confidence the source attaches to this row. Selector parses are 1.0;
  // LLM-extracted rows carry the LLM's confidence; vision rows usually < 1.0.
  confidence: z.number().min(0).max(1).default(1),
  // Optional raw snippet for audit. Cheap to store, invaluable when debugging.
  raw_snippet: z.string().nullable().optional(),
});
export type RawEvent = z.infer<typeof RawEventSchema>;

/**
 * Event: the canonical, normalized, deduped event row stored in the events
 * table. One Event can have multiple sources (kept in event_sources).
 */
export const EventSchema = z.object({
  id: z.string().uuid(),
  artist_id: z.string().uuid().nullable(), // null until artist resolution runs
  artist_display: z.string(), // exact display string for UI
  venue_id: z.string().uuid().nullable(), // null until venue resolution runs
  venue_display: z.string().nullable(),
  city: CitySchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  type: EventTypeSchema,
  ticket_url: z.string().url().nullable(),
  genres: z.array(z.string()), // populated by Spotify enrichment when wired
  status: z.enum(['queued', 'approved', 'rejected', 'removed']),

  first_seen_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
  removed_at: z.string().datetime().nullable(),
});
export type Event = z.infer<typeof EventSchema>;

/**
 * Schema the LLM HTML extractor must conform to. This is what we hand to
 * Claude as the response_format JSON schema. Kept narrow on purpose — the
 * extractor's only job is to lift structured rows out of unstructured HTML.
 */
export const LlmExtractedRowSchema = z.object({
  artist: z.string(),
  venue: z.string().nullable(),
  city: z.string(), // free text, normalize.ts maps to City enum
  date: z.string(), // free text, normalize.ts parses to ISO
  end_date: z.string().nullable(),
  ticket_url: z.string().nullable(),
  genre_hint: z.string().nullable(),
  type: EventTypeSchema,
  confidence: z.number().min(0).max(1),
});
export type LlmExtractedRow = z.infer<typeof LlmExtractedRowSchema>;

export const LlmExtractionResponseSchema = z.object({
  rows: z.array(LlmExtractedRowSchema),
});

/**
 * RunResult: emitted by pipeline.ts at the end of every run. Stored in the
 * runs table for observability and used by the digest builder.
 */
export const RunResultSchema = z.object({
  run_id: z.string().uuid(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  by_source: z.record(
    z.string(),
    z.object({
      fetched: z.number(),
      new_events: z.number(),
      updated_events: z.number(),
      removed_events: z.number(),
      errors: z.array(z.string()),
    })
  ),
  total_new: z.number(),
  total_updated: z.number(),
  total_removed: z.number(),
});
export type RunResult = z.infer<typeof RunResultSchema>;
