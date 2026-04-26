/**
 * Lazy-loaded Playwright browser shared across headless/* sources.
 *
 * One Chromium instance per pipeline run. Each source calls newPage() to
 * isolate cookies/storage. We keep images and fonts blocked by default so
 * pages load faster, since we only need DOM text.
 *
 * Headless sources should prefer XHR interception over full rendering when
 * the target site allows. See README → Source patterns → headless. Use this
 * browser only when direct API calls are blocked by anti-bot or signed
 * headers.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return _browser;
}

export async function newPage(opts?: {
  blockResources?: boolean;
}): Promise<{ page: Page; ctx: BrowserContext; close: () => Promise<void> }> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent:
      process.env.WHIPLASH_USER_AGENT ?? 'whiplash-pipeline (+contact@example.com)',
    viewport: { width: 1280, height: 800 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  if (opts?.blockResources !== false) {
    // Block heavy resources to speed up page loads. Most ticketing sites
    // hydrate enough of the DOM with script+xhr to render the listings even
    // without images/fonts/css.
    await ctx.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        return route.abort();
      }
      return route.continue();
    });
  }

  const page = await ctx.newPage();
  return {
    page,
    ctx,
    close: async () => {
      await ctx.close();
    },
  };
}

export async function shutdownBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
