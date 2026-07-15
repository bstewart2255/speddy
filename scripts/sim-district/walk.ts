/**
 * Shared Playwright plumbing for sim-district verification runs (spec §9).
 * The full playbook lives in the sim-run skill (.claude/skills/sim-run/SKILL.md);
 * this module carries the environment mechanics so run scripts stay tiny.
 *
 * The critical quirk this encodes: in the Claude remote sandbox the BROWSER
 * cannot reach Supabase directly while Node can — every context must be wired
 * with relaySupabase() (newWalkContext does it) or all client-side data
 * fetches fail silently: empty dashboards, no role nav, no redirects.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { derivePassword, simEmail } from './manifest';
import { requireEnv } from './lib';

/** The app under test. Local dev server against the prod DB by default. */
export const BASE_URL = process.env.SIM_RUN_BASE_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Check recording — every run reports positives AND negatives (spec §9)
// ---------------------------------------------------------------------------

export interface Check {
  persona: string;
  kind: 'positive' | 'negative';
  what: string;
  ok: boolean;
  detail?: string;
}

export const checks: Check[] = [];

export function record(
  persona: string,
  kind: Check['kind'],
  what: string,
  ok: boolean,
  detail?: string,
): void {
  checks.push({ persona, kind, what, ok, detail });
  const mark = ok ? 'ok  ' : 'FAIL';
  const tag = kind === 'negative' ? 'NEG ' : 'POS ';
  console.log(`  [${mark}] ${tag} (${persona}) ${what}${detail ? ` — ${detail}` : ''}`);
}

/** Print the tally; returns the number of failed checks (use as exit code). */
export function summarize(): number {
  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${checks.length} checks, ${failed} failed.`);
  return failed;
}

// ---------------------------------------------------------------------------
// Browser + network plumbing
// ---------------------------------------------------------------------------

/** Chromium is preinstalled; fall back to the pinned sandbox paths if the
 *  playwright package's expected revision is missing. Never pass proxy
 *  settings — localhost must stay direct and supabase rides the relay. */
export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    for (const p of ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) {
      try {
        return await chromium.launch({ executablePath: p });
      } catch {
        /* try next */
      }
    }
    throw new Error('no launchable chromium found (see PLAYWRIGHT_BROWSERS_PATH)');
  }
}

/**
 * Route the browser's Supabase traffic through Node fetch. The sandbox blocks
 * direct browser egress to supabase.co but allows it from Node, so route
 * interception relays request/response byte-for-byte (minus hop-by-hop and
 * encoding headers — Node fetch already decompressed the body).
 */
export async function relaySupabase(ctx: BrowserContext): Promise<void> {
  const supaHost = new URL(requireEnv('NEXT_PUBLIC_SUPABASE_URL')).host;
  await ctx.route(`**://${supaHost}/**`, async route => {
    const req = route.request();
    try {
      const headers = { ...req.headers() };
      delete headers['accept-encoding'];
      const resp = await fetch(req.url(), {
        method: req.method(),
        headers,
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : (req.postDataBuffer() ?? undefined),
      });
      const body = Buffer.from(await resp.arrayBuffer());
      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k.toLowerCase())) {
          respHeaders[k] = v;
        }
      });
      await route.fulfill({ status: resp.status, headers: respHeaders, body });
    } catch {
      await route.abort();
    }
  });
}

/** One persona = one fresh context, already wired with the Supabase relay. */
export async function newWalkContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await relaySupabase(ctx);
  return ctx;
}

// ---------------------------------------------------------------------------
// Persona login + waiting helpers
// ---------------------------------------------------------------------------

/**
 * Log in as a persona by manifest email-local (e.g. 'rsp.willow'). Passwords
 * derive from SIM_DISTRICT_PASSWORD — computed here, never printed. Resolves
 * once the URL reaches /dashboard; role-based redirects (admin/sea/teacher)
 * may continue after — assert the final URL in the caller.
 */
export async function loginAs(ctx: BrowserContext, emailLocal: string): Promise<Page> {
  const secret = requireEnv('SIM_DISTRICT_PASSWORD');
  const email = simEmail(emailLocal);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.fill('#email', email);
  await page.fill('#password', derivePassword(secret, email));
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
  return page;
}

/**
 * Wait until the rendered body contains `text` — the reliable signal that a
 * client-side fetch landed. Dev mode compiles routes on first hit, so fixed
 * sleeps race; content waits don't. Returns false instead of throwing so it
 * can feed record() directly.
 */
export async function bodyHas(page: Page, text: string, timeout = 45_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (t: string) => document.body?.innerText?.includes(t) ?? false,
      text,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Nav link labels once the role-specific nav has loaded (the base nav renders
 * first while the client fetches the profile role — wait for a label only the
 * target role has). Desktop + mobile menus both render, so expect duplicates.
 */
export async function navNames(page: Page, expectOne: string): Promise<string[]> {
  try {
    await page.waitForSelector(`nav a:has-text("${expectOne}")`, { timeout: 30_000 });
  } catch {
    /* read whatever nav exists — the caller's assertion reports it */
  }
  const texts = await page.locator('nav a').allInnerTexts();
  return texts.map(t => t.trim()).filter(Boolean);
}

export const hasNav = (names: string[], label: string): boolean =>
  names.some(n => n === label || n.startsWith(label));
