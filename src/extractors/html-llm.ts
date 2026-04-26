import Anthropic from '@anthropic-ai/sdk';
import { LlmExtractionResponseSchema, type LlmExtractedRow } from '../schema.js';

/**
 * LLM-based HTML extractor.
 *
 * Used by static-html sources as a fallback when their selector parser
 * yields zero or malformed rows. Also used directly by sources whose layout
 * is too unstructured for selectors (rare — most editorial sites have
 * predictable structure).
 *
 * Defaults to Claude Haiku 4.5 for cost. Caller can pass `escalate: true`
 * to use Sonnet for hard cases.
 */

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY not set — required for LLM extraction. ' +
          'Set it in .env or run with WHIPLASH_DRY_RUN=true to skip extractors.',
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

const SYSTEM_PROMPT = `You extract live music events from HTML.

Return JSON of the shape: { "rows": [ { ... } ] }
Each row has: artist (string), venue (string|null), city (string),
date (string — keep the source's wording, normalization happens later),
end_date (string|null), ticket_url (string|null), genre_hint (string|null),
type ("concert"|"festival"), confidence (number 0-1).

Rules:
- Each row is ONE event at ONE venue on ONE date (or date range for multi-day).
- Multi-artist bills: combine into a single artist string with commas
  ("Obscura, DVRK"). The pipeline handles splitting downstream.
- Festivals: lineups spanning 2+ days at one venue → type=festival, set end_date.
- If you are unsure about a field, set it to null and lower confidence.
- Skip non-music events (theatre, comedy, sports) silently. Do not return them.
- Skip past events. The user will tell you the cutoff.
- If the HTML contains zero events, return { "rows": [] }.`;

export interface LlmExtractInput {
  html: string;
  /** Source-specific hint included in the prompt. Helps the model know what
   *  kind of page this is and what selectors/structure it might encounter. */
  sourceHint: string;
  /** Lower bound for event dates — anything earlier is dropped. ISO date. */
  cutoffDate: string;
  /** Use Sonnet instead of Haiku. Reserve for retries on low-confidence
   *  Haiku output. */
  escalate?: boolean;
}

export interface LlmExtractResult {
  rows: LlmExtractedRow[];
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function extractFromHtml(
  input: LlmExtractInput,
): Promise<LlmExtractResult> {
  const model = input.escalate ? SONNET_MODEL : HAIKU_MODEL;
  const userPrompt = [
    `Source: ${input.sourceHint}`,
    `Drop any events before ${input.cutoffDate}.`,
    '',
    'HTML follows. Extract events:',
    '',
    truncateHtml(input.html),
  ].join('\n');

  const resp = await client().messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  const json = extractJson(text);
  const parsed = LlmExtractionResponseSchema.parse(json);

  return {
    rows: parsed.rows,
    model,
    usage: {
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
    },
  };
}

/**
 * Trim HTML to a budget that fits inside the model's context comfortably.
 * Strips <script>, <style>, comments, and most attributes; keeps text and
 * key structural tags. The static-html sources should pre-narrow to the
 * gig-list section before calling this; this is a final safety belt.
 */
function truncateHtml(html: string, maxChars = 60000): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ');
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars) + '\n<!-- truncated -->';
}

function extractJson(text: string): unknown {
  // The model sometimes wraps JSON in ```json ... ``` fences. Strip them.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1]! : text;
  return JSON.parse(candidate);
}
