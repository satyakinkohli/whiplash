# whiplash

Concert and festival ingestion pipeline for India. Aggregates live music inventory from editorial calendars, ticketing platforms, venue sites, and (later) Instagram into a single normalized event stream, with an admin approval queue and a daily morning digest email.

## Status

v0 — pipeline layer only. Consumer web app and admin UI live in separate repos and consume this pipeline's output via the `events` table in Supabase.

## Architecture

The pipeline runs once a day. Each run goes through five stages:

1. **Sources** fetch raw data and emit `RawEvent[]`. Each source file is a dumb extractor — fetch + parse, nothing more.
2. **Extractors** are shared utilities sources call into when raw fetched content needs LLM-based interpretation (HTML parse fallback, image OCR).
3. **Normalize** canonicalizes artist names, venue names, dates, and cities so dedupe can match across sources.
4. **Dedupe** merges events that the same `(normalized_artist, venue_id, date)` key from multiple sources, keeping provenance for all.
5. **Persist** writes new and changed events to Supabase, queues low-confidence items for admin review, and triggers the digest email.

```
sources/  →  normalize  →  dedupe  →  persist  →  digest email
```

### Source organization

Sources are organized by **fetch logic**, not by editorial role, because the engineering pattern is what determines maintenance cost.

```
src/sources/
├── static-html/   # plain HTTP GET + Cheerio + LLM fallback
│   ├── rsi.ts            (Rolling Stone India gig calendar — primary editorial)
│   ├── stayvista.ts      (StayVista monthly roundup — editorial)
│   ├── nmacc.ts          (venue)
│   ├── pianoman.ts       (venue)
│   └── skillbox.ts       (ticketing — mostly static)
├── headless/      # Playwright-rendered SPAs (or XHR interception when feasible)
│   ├── _browser.ts       (shared lazy-loaded Chromium instance)
│   ├── bms.ts            (BookMyShow)
│   ├── district.ts       (District.in)
│   └── insider.ts        (Insider.in)
├── api/           # JSON APIs
│   ├── songkick.ts       (international touring artists in India)
│   └── bandsintown.ts    (international touring artists in India)
└── vision/        # image → events via Claude vision LLM (deferred to v0.5)
    └── instagram.ts      (poster extraction from watched IG handles)
```

Every source exports a default object conforming to the `Source` interface in `sources/_types.ts`. Adding a new source = creating one file and registering it in `pipeline.ts`.

### Source patterns

**static-html.** Fetch via `fetch()`, parse with Cheerio. Selector-based extraction first, with an LLM fallback (Claude Haiku 4.5, JSON-validated against a Zod schema) for malformed rows or when selectors return zero results. Snapshot HTML to `tests/fixtures/<source>-<date>.html` periodically; CI runs the parser against the latest fixture so layout changes fail in PR rather than in production.

**headless.** Try XHR/GraphQL interception first per source — open devtools manually, identify the underlying API the page calls, hit it directly with the right headers. Document the API shape at the top of the source file. Fall back to full Playwright rendering only when anti-bot or signed headers make direct calls impractical. Shared Chromium instance in `_browser.ts` to avoid spinning a new one per source.

**api.** Standard JSON API client. Authenticate, paginate, map to `RawEvent`. Use the source's stable event ID as `external_id` for trivially perfect dedupe across runs. Aggressive caching since most queries return mostly the same set day-to-day.

**vision** (v0.5, not implemented). Daily IG feed scrape via Apify (outsourced to avoid the Meta cat-and-mouse), one new post → one Claude Haiku 4.5 vision extraction call → confidence-gated; high confidence flows through the normal pipeline, low confidence goes to admin queue with the poster image attached.

## Setup

```bash
pnpm install
pnpm playwright install chromium
cp .env.example .env
# fill in ANTHROPIC_API_KEY, SUPABASE_*, RESEND_API_KEY at minimum
pnpm migrate
pnpm typecheck
pnpm test
```

## Running

```bash
# Full pipeline (all enabled sources)
pnpm ingest

# Single source (useful for testing one scraper in isolation)
pnpm ingest:source rsi

# Dry run (skips DB writes and email send)
WHIPLASH_DRY_RUN=true pnpm ingest

# Just send the digest for today's diff (no fetching)
pnpm digest
```

## Production schedule

GitHub Actions cron runs `pnpm ingest` daily at 6:00 IST (00:30 UTC). The job writes to Supabase and sends the morning digest via Resend. See `.github/workflows/ingest.yml`.

When we outgrow GitHub Actions cron — typically when we want fan-out, retries, or sub-daily cadence — the migration target is Trigger.dev. The orchestration logic in `pipeline.ts` is intentionally framework-agnostic so the move is mechanical.

## Decisions

Engineering decisions worth knowing about, with reasoning:

- **TypeScript end-to-end.** Types flow from this pipeline into the eventual consumer/admin apps; sharing them avoids drift.
- **Selector-first parsing with LLM fallback.** Cheap and fast on the happy path, resilient when sites change layout. Pure-LLM was rejected as expensive and nondeterministic; pure-selector was rejected as fragile.
- **Soft-delete with `removed_at`.** Events disappearing from a source could mean cancellation, postponement, or editorial cleanup. The admin needs to see this — never hard-delete.
- **Diff-based change detection.** Each run compares against the prior run's snapshot keyed by `(source, artist, venue, date)`. Only new and changed rows enqueue downstream work. Powers the morning digest trivially.
- **No Spotify ingestion.** Spotify's event data is itself sourced from Songkick. We use Spotify only for enrichment (canonical artist ID, genre tags) once we add that layer.
- **Admin approval queue from day one.** Every new event passes through the queue in v0, even from trusted sources. Trust tiers and per-source auto-approval thresholds come later when we have weeks of accuracy data.
- **Snapshot regression tests in `tests/fixtures/`.** Each source commits a recent successful HTML/JSON snapshot. CI runs the parser against it; layout changes fail in PR.

## Layout

```
src/
├── schema.ts              # Zod schema: RawEvent, Event, Venue, Artist, RunResult
├── normalize.ts           # canonicalize artist/venue/date/city
├── dedupe.ts              # dedupe key + cross-source merge
├── pipeline.ts            # orchestrator: source → normalize → dedupe → persist → digest
├── runner.ts              # CLI entry, called by cron / Trigger.dev
├── sources/               # ingestion (organized by fetch logic)
├── extractors/            # shared LLM utilities used by sources
├── enrichment/            # post-ingest enrichment (Spotify lives here when added)
├── digest/email.ts        # daily morning digest via Resend
└── db/
    ├── client.ts          # Supabase client
    └── migrations/        # SQL migrations (events, venues, artists, queue, runs)

tests/
├── fixtures/              # snapshot HTML/JSON per source
├── normalize.test.ts
└── dedupe.test.ts

.github/workflows/
├── ci.yml                 # typecheck + lint + test on PR
└── ingest.yml             # daily 6 IST cron
```

## License

Private, all rights reserved (for now).
