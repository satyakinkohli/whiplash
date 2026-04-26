import { randomUUID } from 'node:crypto';
import type { RawEvent } from './schema.js';
import { type RunResult } from './schema.js';
import { dedupe } from './dedupe.js';
import { normalizeRawEvent } from './normalize.js';
import type { Source } from './sources/_types.js';
import { persist, type PersistResult } from './db/persist.js';
import { sendDigest } from './digest/email.js';
import { shutdownBrowser } from './sources/headless/_browser.js';

import rsi from './sources/static-html/rsi.js';
import stayvista from './sources/static-html/stayvista.js';
import nmacc from './sources/static-html/nmacc.js';
import pianoman from './sources/static-html/pianoman.js';
import skillbox from './sources/static-html/skillbox.js';
import bms from './sources/headless/bms.js';
import district from './sources/headless/district.js';
import insider from './sources/headless/insider.js';
import songkick from './sources/api/songkick.js';
import bandsintown from './sources/api/bandsintown.js';

/**
 * Registry of all sources. Adding a new source = adding it here. The
 * pipeline runs them concurrently with per-source timeouts; one slow source
 * cannot block the others.
 */
const ALL_SOURCES: Source[] = [
  rsi,
  stayvista,
  nmacc,
  pianoman,
  skillbox,
  bms,
  district,
  insider,
  songkick,
  bandsintown,
];

export interface RunOptions {
  /** If set, only run these source ids. Otherwise run all. */
  onlySources?: string[];
  /** Skip DB writes and email send. Useful for local testing. */
  dryRun?: boolean;
  /** Skip the morning digest email even on a real run. */
  skipDigest?: boolean;
  /** Run only the digest stage against today's existing diff (no fetching). */
  digestOnly?: boolean;
}

/**
 * Top-level orchestrator. Idempotent — running it twice in a day is safe and
 * produces the same end state, modulo first_seen_at timestamps.
 */
export async function run(opts: RunOptions = {}): Promise<RunResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const dryRun = opts.dryRun ?? process.env.WHIPLASH_DRY_RUN === 'true';

  if (opts.digestOnly) {
    log('info', `digest-only run ${runId} starting`);
    if (!dryRun) await sendDigest({ runId, startedAt });
    return emptyResult(runId, startedAt);
  }

  log('info', `pipeline run ${runId} starting (dryRun=${dryRun})`);

  const selected = opts.onlySources?.length
    ? ALL_SOURCES.filter((s) => opts.onlySources!.includes(s.id))
    : ALL_SOURCES;

  if (selected.length === 0) {
    throw new Error(`no matching sources (asked for ${opts.onlySources})`);
  }

  // Stage 1: fetch all sources concurrently.
  const fetched = await Promise.all(
    selected.map((s) => fetchOne(s, { startedAt, dryRun })),
  );

  // Stage 2: normalize + dedupe across sources.
  const allRaw: RawEvent[] = fetched.flatMap((f) => f.events);
  const normalized = allRaw.map(normalizeRawEvent);
  const merged = dedupe(normalized);
  log('info', `dedupe: ${normalized.length} raw → ${merged.length} merged`);

  // Stage 3: persist (or skip if dry-run).
  let persistResult: PersistResult = { new: 0, updated: 0, removed: 0 };
  if (!dryRun) {
    persistResult = await persist(merged, { runId });
    log('info', `persisted`, persistResult);
  } else {
    log('info', 'dry-run: skipping persist');
  }

  // Stage 4: digest email.
  if (!dryRun && !opts.skipDigest) {
    try {
      await sendDigest({ runId, startedAt });
    } catch (err) {
      log('error', `digest send failed: ${(err as Error).message}`);
    }
  }

  await shutdownBrowser();

  const finishedAt = new Date().toISOString();
  const result: RunResult = {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    by_source: Object.fromEntries(
      fetched.map((f) => [
        f.source.id,
        {
          fetched: f.events.length,
          // Per-source new/updated/removed isn't computed here in v0; persist()
          // returns aggregate numbers. Future improvement.
          new_events: 0,
          updated_events: 0,
          removed_events: 0,
          errors: f.errors,
        },
      ]),
    ),
    total_new: persistResult.new,
    total_updated: persistResult.updated,
    total_removed: persistResult.removed,
  };
  log('info', `pipeline run ${runId} finished`, {
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
  });
  return result;
}

interface FetchedSource {
  source: Source;
  events: RawEvent[];
  errors: string[];
}

async function fetchOne(
  source: Source,
  opts: { startedAt: string; dryRun: boolean },
): Promise<FetchedSource> {
  const errors: string[] = [];
  const log = (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) =>
    consoleLog(level, `[${source.id}] ${msg}`, meta);

  try {
    const events = await withTimeout(
      source.fetch({
        startedAt: opts.startedAt,
        dryRun: opts.dryRun,
        log,
      }),
      source.timeoutMs,
      source.id,
    );
    log('info', `fetched ${events.length} events`);
    return { source, events, errors };
  } catch (err) {
    const msg = (err as Error).message;
    log('error', `fetch failed: ${msg}`);
    errors.push(msg);
    return { source, events: [], errors };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

function emptyResult(runId: string, startedAt: string): RunResult {
  const finishedAt = new Date().toISOString();
  return {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    by_source: {},
    total_new: 0,
    total_updated: 0,
    total_removed: 0,
  };
}

function log(level: 'info' | 'warn' | 'error', msg: string, meta?: unknown): void {
  consoleLog(level, msg, meta);
}

function consoleLog(level: 'info' | 'warn' | 'error', msg: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  if (meta !== undefined) {
    console[level](line, meta);
  } else {
    console[level](line);
  }
}
