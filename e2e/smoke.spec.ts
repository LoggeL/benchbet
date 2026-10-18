// Playwright smoke (SPEC §7.6, English UI per docs/BRANDING.md). Server + imported public fixture come from
// e2e/global-setup.ts. Both projects (iphone/WebKit, pixel/Chromium) share one server, so every test that needs
// pristine data resets it via the admin import (mode=replace) first.
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { toSnapshot } from '../test/helpers-shared.ts';
import { E2E_ADMIN_TOKEN } from './global-setup.ts';

/** Open fixture bets (no deadline): 1062 (Logge, Nöl, Nikjay), 1061 (Nöl, Logge, Nikjay), 1058 (no Nikjay). */
const OPEN_BET = 1062;
const UNDO_BET = 1061;
const NO_NIKJAY_BET = 1058;

let devSeq = 0;
const device = (tag: string) => `e2e-${tag}-${process.pid}-${++devSeq}-${Date.now().toString(36)}`;

async function resetData(request: APIRequestContext): Promise<void> {
  const r = await request.post('/api/admin/import?mode=replace', {
    headers: { 'x-admin-token': E2E_ADMIN_TOKEN },
    data: toSnapshot(),
  });
  expect(r.status(), await r.text()).toBe(200);
}

async function apiCall<T = Record<string, unknown>>(
  request: APIRequestContext, method: 'post' | 'delete', path: string, body: Record<string, unknown>, dev = device('api'),
): Promise<T> {
  const r = await request[method](path, { headers: { 'x-device-id': dev }, data: body });
  expect(r.ok(), `${method.toUpperCase()} ${path}: ${r.status()} ${await r.text()}`).toBeTruthy();
  return (r.status() === 204 ? null : await r.json()) as T;
}

async function createBet(request: APIRequestContext, input: Record<string, unknown>): Promise<number> {
  const r = await apiCall<{ game: { id: number } }>(request, 'post', '/api/games', { name: 'Logge', ...input });
  return r.game.id;
}

/** Name in localStorage before the app boots (SPEC: „als Logge (localStorage vorab)“). */
async function asPlayer(context: BrowserContext, name: string | null): Promise<void> {
  await context.addInitScript((n) => {
    try {
      if (n) localStorage.setItem('benchbet.name', n);
      localStorage.setItem('benchbet.onboarded', '1'); // start dialog has its own tests (1, 1b)
    } catch {
      /* ignore */
    }
  }, name);
}

/** Wait until the SW controls the page (production build registers it on load). */
async function swControlled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  }
}

/**
 * Headless Chromium reports Notification.permission 'denied' (a real phone starts at 'default'). Restore the
 * real-world starting point so the opt-in UI behaves like on a fresh Android Chrome.
 */
async function freshNotificationPermission(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (typeof Notification === 'undefined') return;
    let perm: NotificationPermission = 'default';
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => perm });
    Notification.requestPermission = async () => (perm = 'granted');
  });
}

const lockInButton = (page: Page) => page.getByRole('button', { name: /^Lock in / });
const undoButton = (page: Page) => page.getByRole('button', { name: /Locked in · Undo/ });

test.beforeAll(async ({ request }) => {
  await resetData(request);
});

/** Tests other than the onboarding ones skip the start dialog like a visitor tapping "Just look around". */
test.beforeEach(async ({ context }, info) => {
  if (/^1[bc]? · /.test(info.title)) return;
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('benchbet.onboardSkip', '1');
    } catch {
      /* ignore */
    }
  });
});

/** Fake PushManager subscription + intercepted /api/push/subscribe (headless browsers can't reach a real push service reliably). */
async function stubPush(context: BrowserContext, page: Page): Promise<() => { name?: string; subscription?: { endpoint?: string; keys?: unknown } } | null> {
  await context.addInitScript(() => {
    const b64 = (n: number) => btoa(String.fromCharCode(...Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    let sub: PushSubscription | null = null;
    const make = (): PushSubscription => {
      const endpoint = 'https://push.example.invalid/e2e-fake-endpoint';
      const keys = { p256dh: b64(65), auth: b64(16) };
      return {
        endpoint, expirationTime: null, options: { userVisibleOnly: true, applicationServerKey: null },
        getKey: () => null, toJSON: () => ({ endpoint, expirationTime: null, keys }),
        unsubscribe: async () => { sub = null; return true; },
      } as unknown as PushSubscription;
    };
    PushManager.prototype.subscribe = async function () { return (sub ??= make()); };
    PushManager.prototype.getSubscription = async function () { return sub; };
  });
  let body: { name?: string; subscription?: { endpoint?: string; keys?: unknown } } | null = null;
  await page.route('**/api/push/subscribe', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ subscriptionId: 1, prefs: { newGame: true, result: true, reminder: true, reminderHours: 2, creator: true } }),
    });
  });
  return () => body;
}

test('1 · first visit & guess: stepper, new name, undo window, reveal, opt-in card', async ({ page, context, browserName }) => {
  await freshNotificationPermission(context);
  await page.goto(`/bet/${OPEN_BET}`);
  // start dialog: name first …
  const dialog = page.getByRole('dialog', { name: 'Welcome to BenchBet' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '+ New' }).click();
  await dialog.getByRole('textbox', { name: 'Your name' }).fill('Testi');
  await dialog.getByRole('button', { name: 'That’s me' }).click();
  // … then push (iPhone Safari: home-screen how-to instead)
  const pushStep = page.getByRole('dialog', { name: 'Hi Testi!' });
  await expect(pushStep).toBeVisible();
  if (browserName === 'webkit') {
    await expect(pushStep.getByText(/On iPhone, push only works once BenchBet is on your home screen/)).toBeVisible();
    await pushStep.getByRole('button', { name: 'Continue in the browser' }).click();
  } else {
    await expect(pushStep.getByRole('button', { name: 'Turn on push' })).toBeVisible();
    await pushStep.getByRole('button', { name: 'Not now' }).click();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kimi K3.1');
  await page.getByRole('button', { name: 'Plus 0.1' }).click();
  await expect(page.getByRole('button', { name: /^Type a number: 50(\.0)? points$/ })).toBeVisible();

  const lock = lockInButton(page);
  await expect(lock).toHaveText('Lock in 50.0 points');
  await lock.click();
  await expect(undoButton(page)).toBeVisible();
  // values of the others stay hidden during the undo window
  await expect(page.getByLabel('Logge’s guess, hidden')).toBeVisible();

  // after 5 s: guess stands, seals open, values visible
  await expect(undoButton(page)).toHaveCount(0, { timeout: 12_000 });
  await expect(page.getByText('Your guess:')).toBeVisible();
  await expect(page.getByLabel(/^Logge’s guess: /)).toBeVisible();
  await expect(page.getByLabel(/hidden$/)).toHaveCount(0);

  // "Not now" a minute ago → no second push ask right after the first guess
  await expect(page.getByText('Want a ping when a new bet drops or a result is in?')).toHaveCount(0);
  await expect(page.getByText('On iPhone, push only works once BenchBet is on your home screen.')).toHaveCount(0);
  // and the start dialog doesn't come back
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kimi K3.1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('1b · start dialog asks a known player for push right away', async ({ page, context, browserName }) => {
  await context.addInitScript(() => localStorage.setItem('benchbet.name', 'Nöl'));
  await freshNotificationPermission(context);
  const body = browserName === 'chromium' ? await stubPush(context, page) : () => null;
  await page.goto('/');
  const pushStep = page.getByRole('dialog', { name: 'Hi Nöl!' });
  await expect(pushStep).toBeVisible();
  if (browserName === 'webkit') {
    await pushStep.getByRole('button', { name: 'Show me how' }).click();
    await expect(page.getByRole('dialog', { name: /home screen/i })).toBeVisible();
    return;
  }
  await swControlled(page);
  const req = page.waitForRequest((r) => r.url().endsWith('/api/push/subscribe') && r.method() === 'POST');
  await pushStep.getByRole('button', { name: 'Turn on push' }).click();
  await req;
  await expect(page.getByRole('dialog', { name: 'Hi Nöl!' })).toHaveCount(0);
  expect(body()!.name).toBe('Nöl');
  await page.reload();
  await expect(page.locator('#main')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('1c · start dialog: push service refuses (Brave default) → reason + fix shown, retry possible', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Web push opt-in only in Chromium here.');
  await context.addInitScript(() => {
    localStorage.setItem('benchbet.name', 'Nöl');
    Object.defineProperty(navigator, 'brave', { configurable: true, value: { isBrave: async () => true } });
    PushManager.prototype.subscribe = async function () { throw new DOMException('Registration failed - push service error', 'AbortError'); };
    PushManager.prototype.getSubscription = async function () { return null; };
  });
  await freshNotificationPermission(context);
  await page.goto('/');
  const pushStep = page.getByRole('dialog', { name: 'Hi Nöl!' });
  await swControlled(page);
  await pushStep.getByRole('button', { name: 'Turn on push' }).click();
  await expect(pushStep.getByRole('alert')).toContainText('brave://settings/privacy');
  await expect(page.getByText('Couldn’t turn on push.')).toBeVisible(); // toast sits above the dialog
  await expect(pushStep.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(pushStep).toBeVisible();
});

test('2 · undo: panel comes back with the same value', async ({ page, context }) => {
  await asPlayer(context, 'Undoer');
  await page.goto(`/bet/${UNDO_BET}`);
  await page.getByRole('button', { name: 'Plus 1', exact: true }).click();
  await page.getByRole('button', { name: 'Plus 1', exact: true }).click();
  const lock = lockInButton(page);
  await expect(lock).toHaveText('Lock in 51.0 points');
  await lock.click();
  await undoButton(page).click();
  await expect(page.getByText('Guess taken back.')).toBeVisible();
  await expect(lockInButton(page)).toHaveText('Lock in 51.0 points');
  await expect(page.getByLabel('Logge’s guess, hidden')).toBeVisible();
  // the server really dropped it
  const st = await (await page.request.get(`/api/games/${UNDO_BET}?name=Undoer`)).json();
  expect(st.game.viewer.hasTipped).toBe(false);
});

test('2b · double-click on "Lock in" keeps the guess (undo is not armed yet)', async ({ page, context }) => {
  await asPlayer(context, 'Doubler');
  await page.goto(`/bet/${UNDO_BET}`);
  await page.getByRole('button', { name: 'Plus 1', exact: true }).click();
  const lock = lockInButton(page);
  await expect(lock).toBeEnabled();
  await lock.dblclick({ delay: 120 });
  await expect(undoButton(page)).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText('Guess taken back.')).toHaveCount(0);
  const st = await (await page.request.get(`/api/games/${UNDO_BET}?name=Doubler`)).json();
  expect(st.game.viewer.hasTipped).toBe(true);
});

test('3 · create: ＋ → AA Index → model name → publish', async ({ page, context }) => {
  await asPlayer(context, 'Logge');
  await page.goto('/');
  await page.getByRole('link', { name: 'New bet' }).first().click();
  await expect(page).toHaveURL(/\/new$/);
  await page.getByRole('button', { name: /AA Index/ }).click();
  await page.locator('[data-f="helper"] input').fill('Smoke 1');
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveValue(/Smoke 1/);
  await page.getByRole('button', { name: 'Publish bet' }).click();
  await expect(page).toHaveURL(/\/bet\/\d+$/);
  await expect(page.getByText('Bet is live. You can join in too.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place guess' })).toBeVisible(); // open guess panel, nothing entered yet
});

test('4 · resolve number: Nöl guesses in a 2nd context, Logge resolves with preview', async ({ page, context, browser, request }) => {
  const id = await createBet(request, {
    template: 'number', prompt: 'Smoke resolve number', answerType: 'number',
    fields: [{ label: 'Score', unit: 'points', min: 0, max: 100, step: 1 }], closesAt: null,
  });
  await apiCall(request, 'post', '/api/tips', { name: 'LZH', gameId: id, values: [30] });

  const u = test.info().project.use;
  const other = await browser.newContext({
    baseURL: u.baseURL, viewport: u.viewport, userAgent: u.userAgent, deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile, hasTouch: u.hasTouch, locale: u.locale, timezoneId: u.timezoneId,
  });
  await asPlayer(other, 'Nöl');
  const nöl = await other.newPage();
  await nöl.goto(`/bet/${id}`);
  await nöl.getByRole('button', { name: 'Plus 10', exact: true }).click(); // first tap on an empty value sets the middle
  await expect(lockInButton(nöl)).toHaveText('Lock in 50 points');
  await lockInButton(nöl).click();
  await expect(undoButton(nöl)).toBeVisible();
  await other.close();

  await asPlayer(context, 'Logge');
  await page.goto(`/bet/${id}/resolve`);
  await page.getByRole('button', { name: 'Close bet and continue' }).click();
  await page.getByRole('button', { name: /^Type a number/ }).click();
  await page.getByRole('textbox', { name: 'Score in points' }).fill('48');
  await page.getByRole('textbox', { name: 'Score in points' }).press('Enter');
  await expect(page.locator('.pv')).toContainText('Winner: Nöl');
  await page.getByRole('button', { name: 'Publish result' }).click();
  await expect(page).toHaveURL(new RegExp(`/bet/${id}$`));
  await expect(page.getByText('Result is out.')).toBeVisible();
  await expect(page.locator('.rc-row.win')).toHaveCount(1);
  await expect(page.locator('.rc-row.win')).toContainText('Nöl');
  await expect(page.locator('.rbox-val')).toContainText('48');
});

test('5 · resolve text: tick two variants → shared win', async ({ page, context, request }) => {
  const id = await createBet(request, { template: 'text', prompt: 'Smoke codename', answerType: 'text', fields: [], closesAt: null });
  await apiCall(request, 'post', '/api/tips', { name: 'Nöl', gameId: id, values: 'Orion' });
  await apiCall(request, 'post', '/api/tips', { name: 'LZH', gameId: id, values: 'Project Orion' });
  await apiCall(request, 'post', '/api/tips', { name: 'Nikjay', gameId: id, values: 'Gemini' });
  await apiCall(request, 'post', `/api/games/${id}/close`, { name: 'Logge' });

  await asPlayer(context, 'Logge');
  await page.goto(`/bet/${id}/resolve`);
  await page.getByRole('textbox', { name: 'Correct answer' }).fill('orion');
  const orion = page.locator('.wp-row', { hasText: 'Nöl' }).getByRole('checkbox');
  const project = page.locator('.wp-row', { hasText: 'LZH' }).getByRole('checkbox');
  await expect(orion).toBeChecked(); // same spelling after normalising → pre-ticked
  await expect(project).not.toBeChecked();
  await project.check();
  await expect(page.locator('.wp-sum')).toHaveText('2 winners: Nöl and LZH → shared win');
  await page.getByRole('button', { name: 'Publish result' }).click();
  await expect(page).toHaveURL(new RegExp(`/bet/${id}$`));
  await expect(page.getByText('Result is out.')).toBeVisible();
  const g = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  expect(g.tips.filter((t: { isWinner: boolean }) => t.isWinner).map((t: { playerName: string }) => t.playerName).sort())
    .toEqual(['LZH', 'Nöl']);
  await expect(page.locator('.cluster.win')).toHaveCount(2);
});

test('6 · leaderboard (fresh fixture) matches SPEC §2.8 exactly', async ({ page, request }) => {
  await resetData(request);
  await page.goto('/leaderboard');
  await expect(page.getByText('14 bets · 7 resolved · 5 players · 46 guesses')).toBeVisible();
  const rows = page.locator('.lrow:not(.sticky-me)');
  await expect(rows).toHaveCount(5);
  const expected = [
    ['1', 'Logge', '3 wins · 42.9%', '14 guesses · 7 scored · 1× bullseye'],
    ['2', 'LZH', '2 wins · 28.6%', '11 guesses · 7 scored'],
    ['2', 'Nöl', '2 wins · 28.6%', '13 guesses · 7 scored'],
    ['4', 'Nikjay', '1 win · 50%', '7 guesses · 2 scored · 1× bullseye'],
    ['–', 'BigDick69', '0 wins · –', '1 guess · 0 scored'],
  ];
  for (const [i, [rank, name, k, s]] of expected.entries()) {
    const row = rows.nth(i);
    await expect(row.locator('.lrow-rank')).toHaveText(rank!);
    await expect(row.locator('.lrow-name')).toHaveText(name!);
    await expect(row.locator('.lrow-k')).toHaveText(k!);
    await expect(row.locator('.lrow-s')).toHaveText(s!);
  }
});

test('7 · legacy link /#spiel-1059 → /bet/1059, result 38, LZH wins', async ({ page }) => {
  await page.goto('/#spiel-1059');
  await expect(page).toHaveURL(/\/bet\/1059$/);
  await expect(page.locator('.rbox-val')).toHaveText('38 points');
  await expect(page.locator('.rc-row.win')).toHaveCount(1);
  await expect(page.locator('.rc-row.win .rc-name')).toHaveText('LZH');
  await expect(page.locator('.rc-row.win .rc-val b')).toHaveText('35 points');
  // old German path redirects as well (server 301)
  await page.goto('/spiel/1059');
  await expect(page).toHaveURL(/\/bet\/1059$/);
});

test('8 · PWA: manifest, SW control, offline shell with locked writes', async ({ page, context, request }) => {
  const m = await request.get('/manifest.webmanifest');
  expect(m.status()).toBe(200);
  const manifest = await m.json();
  expect(manifest.name).toBe('BenchBet');
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable'))).toBe(true);
  for (const icon of manifest.icons as { src: string }[]) {
    const r = await request.get(new URL(icon.src, 'http://x/').pathname);
    expect(r.status(), icon.src).toBe(200);
  }
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);

  await asPlayer(context, 'Nikjay');
  await page.goto(`/bet/${NO_NIKJAY_BET}`);
  await swControlled(page);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(lockInButton(page).or(page.getByRole('button', { name: 'Place guess' }))).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/^Offline – you’re looking at the state from/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Plus 0.1' }).click();
  const lock = lockInButton(page);
  await expect(lock).toBeVisible();
  await expect(lock).toHaveAttribute('aria-disabled', 'true');
  await lock.click({ force: true });
  await expect(page.getByText('Your guess:')).toHaveCount(0);
  // other routes still get the shell
  await page.goto('/leaderboard');
  await expect(page.locator('.lrow').first()).toBeVisible();
  // document requests that aren't real navigations (installability check, prefetch) also get the shell, not a network error
  const doc = await page.evaluate(async () => {
    const r = await fetch('/me', { headers: { accept: 'text/html' } });
    return { status: r.status, html: (await r.text()).includes('<div id="root"') };
  });
  expect(doc).toEqual({ status: 200, html: true });
  await context.setOffline(false);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`9 · layout (${scheme}): no horizontal scroll on main routes`, async ({ page, context }) => {
    await asPlayer(context, 'Logge');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ['/', '/results', '/leaderboard', '/leaderboard/Logge', '/me', '/how-it-works', '/new', `/bet/${OPEN_BET}`, '/bet/1059', '/bet/2']) {
      await page.goto(path);
      await expect(page.locator('#main')).not.toBeEmpty();
      await page.waitForTimeout(150);
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(sw, `${path} overflows (${scheme})`).toBeLessThanOrEqual(iw);
    }
    expect(errors, 'console errors').toEqual([]);
  });
}

test('9 · layout: body background differs between light and dark', async ({ page }) => {
  const bg: Record<string, string> = {};
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.locator('#main')).not.toBeEmpty();
    bg[scheme] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  }
  expect(bg.light).not.toBe(bg.dark);
  expect(bg.light).not.toBe('rgba(0, 0, 0, 0)');
});

test('10 · push UI (Chromium): stubbed permission + subscription → "Push is on"', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Push opt-in is only offered in Chromium (iOS Safari needs the home screen).');
  await asPlayer(context, 'Logge');
  await freshNotificationPermission(context);
  const body = await stubPush(context, page);
  await page.goto('/me');
  await swControlled(page);
  await expect(page.getByText('Push is off.')).toBeVisible();
  const req = page.waitForRequest((r) => r.url().endsWith('/api/push/subscribe') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Push on', exact: true }).click();
  await req;
  await expect(page.getByText('Push is on for this device ✓')).toBeVisible();
  expect(body()!.name).toBe('Logge');
  expect(body()!.subscription?.endpoint).toBe('https://push.example.invalid/e2e-fake-endpoint');
  expect(body()!.subscription?.keys).toBeTruthy();
});
