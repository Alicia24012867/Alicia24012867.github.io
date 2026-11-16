// The provider as an application sees it, through openid-client: discovery, sign-in with PKCE,
// signed tokens, userinfo, refresh, revocation and the ways a sign-in ends.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as oidc from 'openid-client';
import { updatePerson } from '../src/people.ts';
import {
  Browser,
  acceptInvite,
  addPerson,
  appServer,
  authorization,
  decode,
  discover,
  eventually,
  field,
  passkeyDevice,
  registerApp,
  startService,
  verifiedClaims,
} from './helpers.ts';

let service: Awaited<ReturnType<typeof startService>>;
let app: Awaited<ReturnType<typeof appServer>>;
let config: oidc.Configuration;
let callback: string;
let admin: Browser;

before(async () => {
  service = await startService();
  app = await appServer();
  callback = `${app.origin}/callback`;
  const secret = await registerApp(service.auth, { id: 'blog', origin: app.origin });
  config = await discover(service.issuer, 'blog', secret);
  admin = new Browser(service.issuer);
  passkeyDevice(service.auth, admin, addPerson(service.auth, 'Alicia', ['admin']));
});
after(async () => {
  await service.stop();
  await app.close();
});

/** Signs the browser's person in to the blog; the browser is signed in here already. */
async function signInToApp(browser: Browser) {
  const flow = await authorization(config, callback);
  const { left, response } = await browser.follow(flow.url);
  assert.ok(left, `expected a way back to the app, got ${response.status}`);
  return flow.finish(left);
}

/** The logout token the app was sent for a session, once it arrives, its signature checked. */
async function logoutFor(sid: unknown) {
  const token = await eventually(() => app.logouts.find((t) => decode(t).sid === sid));
  return verifiedClaims(service.issuer, token);
}

const refreshFails = (token: string) =>
  assert.rejects(oidc.refreshTokenGrant(config, token), (error: { error?: string }) => {
    assert.equal(error.error, 'invalid_grant');
    return true;
  });

/** Where an app's sign-in leaves a browser that has to sign in first. */
async function signInPage(browser: Browser) {
  const { left, url, response } = await browser.follow((await authorization(config, callback)).url);
  assert.equal(left, undefined);
  assert.match(url.pathname, /^\/interaction\/[\w-]+$/);
  return response.text();
}

test('discovery describes the provider', () => {
  const meta = config.serverMetadata();
  assert.equal(meta.issuer, service.issuer);
  assert.deepEqual(meta.response_types_supported, ['code']);
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(meta.token_endpoint_auth_methods_supported, ['client_secret_basic', 'none']);
  assert.deepEqual(meta.id_token_signing_alg_values_supported, ['RS256']);
  assert.ok(meta.scopes_supported?.includes('groups'));
  assert.equal(meta.backchannel_logout_supported, true);
  assert.equal(meta.backchannel_logout_session_supported, true);
});

test('an invited person reaches the app without a page, with their name and groups', async () => {
  const mei = addPerson(service.auth, 'Mei', ['friends']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, mei);
  const tokens = await signInToApp(browser);

  const claims = await verifiedClaims(service.issuer, tokens.id_token!);
  assert.equal(claims.iss, service.issuer);
  assert.equal(claims.aud, 'blog');
  assert.equal(claims.sub, mei.id);
  assert.equal(claims.name, 'Mei');
  assert.deepEqual(claims.groups, ['friends']);
  assert.equal(claims.email, undefined);
  assert.equal(typeof claims.sid, 'string');
  assert.equal(tokens.expires_in, 600);
  assert.ok(tokens.refresh_token, 'a refresh token, without asking for offline_access');

  const info = await oidc.fetchUserInfo(config, tokens.access_token, mei.id);
  assert.equal(info.name, 'Mei');
  assert.deepEqual(info.groups, ['friends']);

  // A refresh brings what changed: a new group, a new name.
  updatePerson(service.auth.db, mei.id, {
    name: 'Mei Lin',
    email: null,
    groups: ['friends', 'family'],
  });
  const refreshed = await oidc.refreshTokenGrant(config, tokens.refresh_token!);
  const now = refreshed.claims()!;
  assert.equal(now.name, 'Mei Lin');
  assert.deepEqual([...(now.groups as string[])].sort(), ['family', 'friends']);
});

test('PKCE is required', async () => {
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callback,
    scope: 'openid',
    state: 's',
  });
  const { left } = await new Browser(service.issuer).follow(url);
  assert.equal(left?.searchParams.get('error'), 'invalid_request');
});

test('an unregistered redirect gets an error page, never a redirect', async () => {
  const flow = await authorization(config, 'https://example.com/callback');
  const { response, left } = await new Browser(service.issuer).follow(flow.url);
  assert.equal(left, undefined);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Something went wrong/);
});

test('someone not signed in sees the sign-in page, and can go back to the app', async () => {
  const browser = new Browser(service.issuer);
  const flow = await authorization(config, callback);
  const { response, url } = await browser.follow(flow.url);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /The blog/);
  assert.match(page, /data-passkey="authenticate"/);
  const { left } = await browser.follow(`${url.pathname}/abort`, { form: {} });
  assert.equal(left?.origin + left!.pathname, callback);
  assert.equal(left?.searchParams.get('error'), 'access_denied');
});

test('turning someone off signs them out of apps at once', async (t) => {
  const lin = addPerson(service.auth, 'Lin', ['family']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, lin);
  const tokens = await signInToApp(browser);

  const started = performance.now();
  const response = await admin.request(`/admin/people/${lin.id}/off`, { form: {} });
  assert.equal(response.status, 303);
  const logout = await logoutFor(tokens.claims()!.sid);
  t.diagnostic(`the app heard ${(performance.now() - started).toFixed(0)} ms after the click`);
  assert.equal(logout.sub, lin.id);
  assert.equal(logout.aud, 'blog');
  const events = logout.events as Record<string, unknown>;
  assert.ok(events['http://schemas.openid.net/event/backchannel-logout']);

  await refreshFails(tokens.refresh_token!);
  await assert.rejects(oidc.fetchUserInfo(config, tokens.access_token, lin.id));
  assert.match(await signInPage(browser), /Sign in/);

  // Turned on again, they need a new invite.
  await admin.request(`/admin/people/${lin.id}/on`, { form: {} });
  assert.match(await signInPage(browser), /Sign in/);
});

test('removing one device ends the sessions begun on it, and no others', async () => {
  const jun = addPerson(service.auth, 'Jun', ['friends']);
  const phone = new Browser(service.issuer);
  const laptop = new Browser(
    service.issuer,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  );
  await acceptInvite(service.auth, phone, jun);
  await acceptInvite(service.auth, laptop, jun);
  const onPhone = await signInToApp(phone);
  const onLaptop = await signInToApp(laptop);

  // From the laptop's account page, which lists the phone.
  const account = await (await laptop.request('/account')).text();
  assert.match(account, /WeChat on iPhone/);
  const phoneDevice = phone.cookie('device')!.split('.')[0]!;
  const response = await laptop.request(`/account/devices/${phoneDevice}/delete`, { form: {} });
  assert.equal(response.status, 303);

  await logoutFor(onPhone.claims()!.sid);
  await refreshFails(onPhone.refresh_token!);
  assert.match(await signInPage(phone), /Sign in/);
  const still = await oidc.refreshTokenGrant(config, onLaptop.refresh_token!);
  assert.equal(still.claims()!.sub, jun.id);
  assert.ok(!app.logouts.some((token) => decode(token).sid === onLaptop.claims()!.sid));
});

test('signing out of the app and the site forgets the device', async () => {
  const yu = addPerson(service.auth, 'Yu', ['friends']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, yu);
  const tokens = await signInToApp(browser);

  const end = oidc.buildEndSessionUrl(config, {
    id_token_hint: tokens.id_token!,
    post_logout_redirect_uri: `${app.origin}/`,
  });
  const page = await (await browser.follow(end)).response.text();
  assert.match(page, /Keep this device signed in/);
  const { left } = await browser.follow('/session/end/confirm', {
    form: { xsrf: field(page, 'xsrf')!, logout: 'yes' },
  });
  assert.equal(left?.href, `${app.origin}/`);
  await logoutFor(tokens.claims()!.sid);
  await refreshFails(tokens.refresh_token!);
  assert.equal(browser.cookie('device'), undefined);
  assert.match(await signInPage(browser), /Sign in/);
});

test('signing out of the app alone keeps the device signed in', async () => {
  const an = addPerson(service.auth, 'An', ['friends']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, an);
  const tokens = await signInToApp(browser);

  const end = oidc.buildEndSessionUrl(config, {
    id_token_hint: tokens.id_token!,
    post_logout_redirect_uri: `${app.origin}/`,
  });
  const page = await (await browser.follow(end)).response.text();
  const { left } = await browser.follow('/session/end/confirm', {
    form: { xsrf: field(page, 'xsrf')! },
  });
  assert.equal(left?.href, `${app.origin}/`);
  await refreshFails(tokens.refresh_token!);
  assert.ok(browser.cookie('device'));
  const again = await signInToApp(browser);
  assert.equal(again.claims()!.sub, an.id);

  // Without a page to return to, the provider's own page says the device stays signed in.
  const bare = oidc.buildEndSessionUrl(config, { id_token_hint: again.id_token! });
  const question = await (await browser.follow(bare)).response.text();
  const done = await browser.follow('/session/end/confirm', {
    form: { xsrf: field(question, 'xsrf')! },
  });
  assert.match(await done.response.text(), /still signed in to nymphilia\.com/);
});

test('an invite for someone else signs the first person out of that browser', async () => {
  const qing = addPerson(service.auth, 'Qing', ['friends']);
  const bo = addPerson(service.auth, 'Bo', ['family']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, qing);
  const first = await signInToApp(browser);
  await acceptInvite(service.auth, browser, bo);
  await logoutFor(first.claims()!.sid);
  await refreshFails(first.refresh_token!);
  const second = await signInToApp(browser);
  assert.equal(second.claims()!.sub, bo.id);
});

test('an app can hand its refresh token back', async () => {
  const he = addPerson(service.auth, 'He', ['friends']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, he);
  const tokens = await signInToApp(browser);
  await oidc.tokenRevocation(config, tokens.refresh_token!);
  await refreshFails(tokens.refresh_token!);
});

test('a wrong client secret is refused', async () => {
  const wrong = await discover(service.issuer, 'blog', 'not-the-secret');
  const he = addPerson(service.auth, 'Wen', ['friends']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, he);
  const flow = await authorization(wrong, callback);
  const { left } = await browser.follow(flow.url);
  await assert.rejects(
    flow.finish(left!),
    (error: { status?: number; cause?: { parameters: { error?: string } }[] }) => {
      assert.equal(error.status, 401);
      assert.equal(error.cause?.[0]?.parameters.error, 'invalid_client');
      return true;
    },
  );
});

test('an app on a computer, without a secret, signs in with PKCE on any localhost port', async () => {
  await registerApp(service.auth, {
    id: 'blog-dev',
    origin: 'http://localhost',
    name: 'The blog, in development',
    native: true,
    confidential: false,
    backchannelLogoutUri: null,
  });
  const dev = await discover(service.issuer, 'blog-dev', null);
  const ming = addPerson(service.auth, 'Ming', ['friends']);
  const browser = new Browser(service.issuer);
  await acceptInvite(service.auth, browser, ming);
  const flow = await authorization(dev, `${app.origin}/callback`);
  const { left } = await browser.follow(flow.url);
  assert.ok(left);
  const tokens = await flow.finish(left);
  assert.equal(tokens.claims()!.sub, ming.id);
  assert.ok(tokens.refresh_token);
});
