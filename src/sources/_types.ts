import type { RawEvent, SourceProvenance } from '../schema.js';

/**
 * The contract every source file fulfills. One source = one file = one
 * default-exported Source. The pipeline imports them by name and runs them
 * concurrently with a per-source timeout.
 *
 * Sources are deliberately dumb. They:
 *   - know how to fetch their corner of the internet
 *   - know how to parse it into RawEvent[]
 *   - emit empty array + log on soft failures
 *   - throw on hard failures (network, auth, anti-bot block)
 *
 * They do NOT:
 *   - normalize artist/venue/date strings (that's normalize.ts)
 *   - dedupe (that's dedupe.ts)
 *   - write to the DB (that's persist.ts via pipeline.ts)
 *   - know about other sources
 */
export interface Source {
  /** Stable identifier, lowercase, used as the source_id in RawEvent. */
  id: string;

  /** Which fetch pattern this source uses. Drives logging and admin UI. */
  provenance: SourceProvenance;

  /** Human-readable name for logs and the digest email. */
  displayName: string;

  /**
   * Per-source timeout. Static HTML defaults to 10s; headless can take 60s+;
   * vision can take 30s+ per image so the source aggregates them. The
   * pipeline cancels the source if it exceeds this.
   */
  timeoutMs: number;

  /** Fetch + parse. Returns RawEvent[]. */
  fetch: (ctx: SourceContext) => Promise<RawEvent[]>;
}

export interface SourceContext {
  /** UTC datetime the run started. Sources should set fetched_at to this. */
  startedAt: string;
  /** When true, sources should not write fixtures or hit external APIs that
   *  cost money. They should still hit free read-only endpoints if possible
   *  so the parser is exercised. */
  dryRun: boolean;
  /** Logger scoped to the source. */
  log: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void;
}
