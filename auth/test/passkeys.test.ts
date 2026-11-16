// Passkeys in a real browser: headless Chrome with virtual authenticators, one per tab. The tabs
// share cookies, as two windows of one browser do; each test starts from the cookies it needs.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type * as oidc from 'openid-client';
import { createLink } from '../src/links.ts';
import { passkeysOf } from '../src/passkeys.ts';
import type { Person } from '../src/people.ts';
import { Chrome, chromePath, type Page } from './chrome.ts';
import {
  addPerson,
  appServer,
  authorization,
  decode,
  discover,
  eventually,
  registerApp,
  startService,
} from './helpers.ts';

// CI has Chrome; a computer without it skips these rather than failing.
const skip = !chromePath && !process.env.CI ? 'needs Google Chrome' : false;

let service: Awaited<ReturnType<typeof startService>>;
let app: Awaited<ReturnType<typeof appServer>>;
let chrome: Chrome;
let alicias: Page;
let meis: Page;
let alicia: Person;
let mei: Person;
let config: oidc.Configuration;
let callback: string;

before(async () => {
  if (skip) return;
  service = await startService();
  app = await appServer();
  callback = `${app.origin}/callback`;
  config = await discover(
    service.issuer,
    'blog',
    await registerApp(service.auth, { id: 'blog', origin: app.origin }),
  );
  chrome = await Chrome.launch();
  alicias = await chrome.newPage();
  meis = await chrome.newPage();
  alicia = addPerson(service.auth, 'Alicia', ['admin']);
  mei = addPerson(service.auth, 'Mei', ['friends']);
});
after(async () => {
  await chrome?.close();
  await service?.stop();
  await app?.close();
});

const at = (path: string) => `${service.issuer}${path}`;

test('a setup link makes a passkey and opens the admin pages', { skip }, async () => {
  const link = createLink(service.auth.db, alicia.id, 'setup', 3600);
  await alicias.goto(at(link.path));
  assert.match(await alicias.text(), /Create your passkey, Alicia/);
  await alicias.click('[data-passkey="register"]');
  await alicias.waitFor(`location.pathname === '/admin'`);

  const [credential, ...others] = await alicias.credentials();
  assert.equal(others.length, 0);
  assert.ok(credential!.isResidentCredential, 'a passkey that can sign in without a name');
  assert.equal(Buffer.from(credential!.userHandle, 'base64').toString(), alicia.id);
  assert.equal(passkeysOf(service.auth, alicia.id).length, 1);

  await alicias.goto(at(link.path));
  assert.match(await alicias.text(), /This link has been used or has expired/);
});

test('the passkey signs the administrator in again after signing out', { skip }, async () => {
  await alicias.goto(at('/account'));
  await alicias.click('form[action="/logout"] button');
  await alicias.waitFor(`document.body.innerText.includes('signed out')`);
  await alicias.goto(at('/admin'));
  assert.equal(await alicias.path(), '/login');
  await alicias.click('[data-passkey="authenticate"]');
  await alicias.waitFor(`location.pathname === '/admin'`);
});

test('an app’s sign-in page takes a passkey', { skip }, async () => {
  await alicias.forgetCookies();
  const flow = await authorization(config, callback);
  await alicias.goto(flow.url.href);
  assert.match(await alicias.text(), /Sign in to The blog/);
  await alicias.click('[data-passkey="authenticate"]');
  await alicias.waitFor(`location.href.startsWith(${JSON.stringify(callback)})`);
  const tokens = await flow.finish(new URL(await alicias.evaluate<string>('location.href')));
  assert.equal(tokens.claims()!.sub, alicia.id);
  assert.deepEqual(tokens.claims()!.groups, ['admin']);
});

test('an invited friend adds a passkey, and later signs in with it', { skip }, async () => {
  await meis.forgetCookies();
  const invite = createLink(service.auth.db, mei.id, 'invite', 86400);
  await meis.goto(at(invite.path));
  await meis.click('form[action^="/invite/"] button');
  await meis.waitFor(`location.pathname === '/welcome'`);
  await meis.click('[data-passkey="register"]');
  await meis.waitFor(`!document.querySelector('[data-passkey="register"]')`);
  assert.match(await meis.text(), /You're in, Mei/);
  assert.equal(passkeysOf(service.auth, mei.id).length, 1);

  // A new device: no cookies, only the passkey.
  await meis.forgetCookies();
  await meis.goto(at('/account'));
  assert.equal(await meis.path(), '/login');
  await meis.click('[data-passkey="authenticate"]');
  await meis.waitFor(`location.pathname === '/account'`);
  assert.match(await meis.text(), /Mei\s+In friends/);
});

test(
  'a passkey for someone else, at an app’s sign-in, starts it afresh for them',
  { skip },
  async () => {
    // Mei is signed in to the app; then this browser forgets her device, but not her session.
    await meis.goto(at('/account'));
    const first = await authorization(config, callback);
    await meis.goto(first.url.href);
    await meis.waitFor(`location.href.startsWith(${JSON.stringify(callback)})`);
    const meiTokens = await first.finish(new URL(await meis.evaluate<string>('location.href')));
    assert.equal(meiTokens.claims()!.sub, mei.id);
    await meis.forgetCookies('device', service.issuer);

    // The app asks for a sign-in, and Alicia answers with her passkey.
    const second = await authorization(config, callback, 'openid profile groups', {
      prompt: 'login',
    });
    await alicias.goto(second.url.href);
    assert.match(await alicias.text(), /Sign in to The blog/);
    await alicias.click('[data-passkey="authenticate"]');
    await alicias.waitFor(`location.href.startsWith(${JSON.stringify(callback)})`);
    const tokens = await second.finish(new URL(await alicias.evaluate<string>('location.href')));
    assert.equal(tokens.claims()!.sub, alicia.id);
    // Mei's session in this browser ended, and the app heard.
    await eventually(() =>
      app.logouts.some((token) => decode(token).sid === meiTokens.claims()!.sid),
    );
  },
);
