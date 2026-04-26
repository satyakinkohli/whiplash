import 'dotenv/config';
import { run } from './pipeline.js';

/**
 * CLI entry point. Used by:
 *   - `pnpm ingest`            — full run, all sources
 *   - `pnpm ingest:source rsi` — single source
 *   - `pnpm digest`            — digest-only, no fetching
 *   - GitHub Actions cron      — `node dist/runner.js` (built via tsc) or
 *                                `tsx src/runner.ts` (dev)
 */

interface ParsedArgs {
  onlySources?: string[];
  dryRun: boolean;
  digestOnly: boolean;
  skipDigest: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    dryRun: process.env.WHIPLASH_DRY_RUN === 'true',
    digestOnly: false,
    skipDigest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') {
      const next = argv[i + 1];
      if (!next) throw new Error('--source requires a source id');
      args.onlySources = next.split(',').map((s) => s.trim());
      i++;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--digest-only') {
      args.digestOnly = true;
    } else if (arg === '--skip-digest') {
      args.skipDigest = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg) {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.info(`
whiplash — concert/festival ingestion pipeline

Usage:
  tsx src/runner.ts [options]

Options:
  --source <id[,id]>  Run only the named source(s).
  --dry-run           Skip DB writes and email send.
  --digest-only       Send today's digest from existing data; no fetching.
  --skip-digest       Run sources but skip the morning digest email.
  --help, -h          Show this help.

Environment:
  ANTHROPIC_API_KEY              Required for LLM extractor.
  SUPABASE_URL/SERVICE_ROLE_KEY  Required for persist (skipped in --dry-run).
  RESEND_API_KEY/DIGEST_*_EMAIL  Required for digest (skipped in --dry-run).
  SONGKICK_API_KEY               Optional. songkick source skips without it.
  BANDSINTOWN_APP_ID             Optional. bandsintown source skips without it.
  WHIPLASH_DRY_RUN=true          Same as --dry-run.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await run(args);
  console.info(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('pipeline failed:', err);
  process.exit(1);
});
