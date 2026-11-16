// The service's own pages: invites, the account page, signing out, and what keeps them safe.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { now } from '../src/db.ts';
import { createLink } from '../src/links.ts';
import { Browser, acceptInvite, addPerson, startService } from './helpers.ts';

let service: Awaited<ReturnType<typeof startService>>;

before(async () => {
  service = await startService();
});
after(async () => {
  await service.stop();
});

test('an invite opens without being used, and works once', async () => {
  const mei = addPerson(service.auth, 'Mei', ['friends']);
  const link = createLink(service.auth.db, mei.id, 'invite', 86400);

  // A messenger fetching a preview of the link doesn't use it up.
  const preview = await new Browser(service.issuer, 'WhatsApp/2.23').request(link.path);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Hello, Mei/);

  const browser = new Browser(service.issuer);
  const used = await browser.request(link.path, { form: {} });
  assert.equal(used.status, 303);
  assert.equal(used.headers.get('location'), '/welcome');
  assert.ok(browser.cookie('device'));
  const welcome = await (await browser.request('/welcome')).text();
  assert.match(welcome, /You(&#39;|')re in, Mei/);
  assert.match(welcome, /data-passkey="register"/);

  const late = new Browser(service.issuer);
  assert.equal((await late.request(link.path)).status, 410);
  assert.equal((await late.request(link.path, { form: {} })).status, 410);
  assert.equal(late.cookie('device'), undefined);

  // Another link, opened where Mei is signed in already, stays unused.
  const spare = createLink(service.auth.db, mei.id, 'invite', 86400);
  assert.match(
    await (await browser.request(spare.path)).text(),
    /already signed in on this device/,
  );
  assert.equal((await new Browser(service.issuer).request(spare.path)).status, 200);
});

test('an expired, revoked or made-up invite does nothing', async () => {
  const lin = addPerson(service.auth, 'Lin', ['family']);
  const expired = createLink(service.auth.db, lin.id, 'invite', 86400);
  service.auth.db
    .prepare('UPDATE links SET expires_at = ? WHERE id = ?')
    .run(now() - 1, expired.id);
  const revoked = createLink(service.auth.db, lin.id, 'invite', 86400);
  service.auth.db.prepare('DELETE FROM links WHERE id = ?').run(revoked.id);
  for (const path of [expired.path, revoked.path, `/invite/${'x'.repeat(43)}`, '/invite/short']) {
    const browser = new Browser(service.issuer);
    assert.equal((await browser.request(path)).status, 410, path);
    assert.equal((await browser.request(path, { form: {} })).status, 410, path);
    assert.equal(browser.cookie('device'), undefined);
  }
});

test('an invite stops working when its person is turned off', async () => {
  const bo = addPerson(service.auth, 'Bo', ['friends']);
  const link = createLink(service.auth.db, bo.id, 'invite', 86400);
  service.auth.db.prepare('UPDATE people SET disabled_at = ? WHERE id = ?').run(now(), bo.id);
  assert.equal((await new Browser(service.issuer).request(link.path, { form: {} })).status, 410);
});

test('administrators get no invites', async () => {
  const admin = addPerson(service.auth, 'Admin', ['admin']);
  const link = createLink(service.auth.db, admin.id, 'invite', 86400);
  const browser = new Browser(service.issuer);
  assert.equal((await browser.request(link.path)).status, 403);
  assert.equal((await browser.request(link.path, { form: {} })).status, 403);
  assert.equal(browser.cookie('device'), undefined);
});

test('a form posted from another site is refused', async () => {
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, addPerson(service.auth, 'Yu', ['friends']));
  const refused: { origin: string | null; headers?: Record<string, string> }[] = [
    { origin: 'https://evil.example' },
    { origin: 'null' },
    { origin: null, headers: { 'sec-fetch-site': 'cross-site' } },
    { origin: null, headers: { referer: 'https://evil.example/page' } },
    { origin: null },
  ];
  for (const init of refused) {
    const response = await browser.request('/logout', { form: {}, ...init });
    assert.equal(response.status, 403, JSON.stringify(init));
  }
  assert.ok(browser.cookie('device'), 'still signed in');
  const fromHere = await browser.request('/logout', {
    form: {},
    origin: null,
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  assert.equal(fromHere.status, 200);
  assert.equal(browser.cookie('device'), undefined);
});

test('the account page lists the devices; signing out makes this one forget', async () => {
  const an = addPerson(service.auth, 'An', ['friends', 'family']);
  const phone = new Browser(service.issuer);
  const laptop = new Browser(
    service.issuer,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36',
  );
  await acceptInvite(service.auth, phone, an);
  await acceptInvite(service.auth, laptop, an);
  const page = await (await laptop.request('/account')).text();
  assert.match(page, /<h1>An<\/h1>/);
  assert.match(page, /In friends, family|In family, friends/);
  assert.match(page, /WeChat on iPhone/);
  assert.match(page, /Chrome on Windows <em>this device<\/em>/);
  assert.doesNotMatch(page, /href="\/admin"/);

  const out = await laptop.request('/logout', { form: {} });
  assert.match(await out.text(), /You(&#39;|')re signed out/);
  assert.equal(laptop.cookie('device'), undefined);
  assert.equal(
    (await laptop.request('/account')).headers.get('location'),
    '/login?next=%2Faccount',
  );
  assert.equal((await phone.request('/account')).status, 200, 'the phone stays signed in');
});

test('pages carry a strict content policy, on the provider’s pages too', async () => {
  const browser = new Browser(service.issuer);
  for (const path of ['/login', '/auth?client_id=nobody', '/nope']) {
    const response = await browser.request(path);
    const policy = response.headers.get('content-security-policy') ?? '';
    assert.match(policy, /default-src 'none'/, path);
    assert.match(policy, /script-src 'self'/, path);
    assert.match(policy, /frame-ancestors 'none'/, path);
    assert.match(policy, /font-src https:\/\/nymphilia\.com/, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(response.headers.get('referrer-policy'), 'same-origin', path);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/, path);
    assert.match(await response.text(), /<link rel="stylesheet" href="\/static\/style.css">/, path);
  }
  const missing = await browser.request('/nope');
  assert.equal(missing.status, 404);
});

test('after signing in, people go only to pages of this service', async () => {
  const browser = new Browser(service.issuer);
  const nextOf = async (next: string) => {
    const page = await (await browser.request(`/login?next=${encodeURIComponent(next)}`)).text();
    return /data-next="([^"]*)"/.exec(page)?.[1];
  };
  for (const next of [
    '//evil.example/',
    '/\\evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/\n/evil.example',
    '',
  ]) {
    assert.equal(await nextOf(next), '/account', JSON.stringify(next));
  }
  assert.equal(await nextOf('/admin/apps'), '/admin/apps');
});

test('static files revalidate by their hash', async () => {
  const first = await fetch(`${service.issuer}/static/style.css`);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  assert.equal(first.headers.get('content-type'), 'text/css; charset=utf-8');
  const again = await fetch(`${service.issuer}/static/style.css`, {
    headers: { 'if-none-match': etag },
  });
  assert.equal(again.status, 304);
  const library = await (await fetch(`${service.issuer}/static/webauthn.js`)).text();
  assert.match(library, /SimpleWebAuthnBrowser/);
  const fonts = await (await fetch(`${service.issuer}/static/fonts.css`)).text();
  assert.match(fonts, /url\('https:\/\/nymphilia\.com\/fonts\//);
  assert.equal((await fetch(`${service.issuer}/static/nope.css`)).status, 404);
});

test('the shell makes the first administrator, once', async () => {
  const own = await startService();
  try {
    const run = (...args: string[]) =>
      spawnSync(
        process.execPath,
        ['--disable-warning=ExperimentalWarning', 'src/cli.ts', ...args],
        {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, AUTH_DATA: own.auth.config.dataDir, AUTH_ISSUER: own.issuer },
          encoding: 'utf8',
        },
      );
    const made = run('bootstrap', '--name', 'Alicia');
    assert.equal(made.status, 0, made.stderr);
    const url = /(http:\/\/localhost:\d+\/setup\/[\w-]{43})/.exec(made.stdout)?.[1];
    assert.ok(url, made.stdout);
    const page = await new Browser(own.issuer).request(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Create your passkey, Alicia/);

    const twice = run('bootstrap', '--name', 'Someone');
    assert.equal(twice.status, 1);
    assert.match(twice.stderr, /administrator already/);
    const another = run('setup-link');
    assert.equal(another.status, 0, another.stderr);
    assert.match(another.stdout, /\/setup\/[\w-]{43}/);
    assert.match(run('people').stdout, /Alicia {2}admin/);
  } finally {
    await own.stop();
  }
});
