// The admin pages: who may open them, and what they do to people, groups and apps.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { now } from '../src/db.ts';
import { findPerson, listGroups, listPeople, type Person } from '../src/people.ts';
import { Browser, acceptInvite, addPerson, passkeyDevice, startService } from './helpers.ts';

let service: Awaited<ReturnType<typeof startService>>;
let admin: Browser;
let alicia: Person;

before(async () => {
  service = await startService();
  alicia = addPerson(service.auth, 'Alicia', ['admin']);
  admin = new Browser(
    service.issuer,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15',
  );
  passkeyDevice(service.auth, admin, alicia);
});
after(async () => {
  await service.stop();
});

const named = (name: string) => listPeople(service.auth.db).find((person) => person.name === name)!;
const linkIn = (page: string) =>
  /value="(http:\/\/localhost:\d+\/(?:invite|setup)\/[\w-]{43})"/.exec(page)?.[1];

test('the admin pages are for administrators who used a passkey lately', async () => {
  const friend = new Browser(service.issuer);
  await acceptInvite(service.auth, friend, addPerson(service.auth, 'Mei', ['friends']));
  assert.equal((await friend.request('/admin')).status, 403);
  assert.equal((await friend.request('/admin/people/new')).status, 403);
  assert.equal(
    (await friend.request('/admin/groups', { form: { name: 'x', label: 'X' } })).status,
    403,
  );

  const stranger = await new Browser(service.issuer).request('/admin');
  assert.equal(stranger.headers.get('location'), '/login?next=%2Fadmin');

  // Twelve hours after a passkey, the admin pages ask for it again.
  const stale = new Browser(service.issuer);
  const id = passkeyDevice(service.auth, stale, alicia);
  service.auth.db
    .prepare('UPDATE devices SET passkey_at = ? WHERE id = ?')
    .run(now() - 13 * 3600, id);
  assert.equal(
    (await stale.request('/admin/apps/new')).headers.get('location'),
    '/login?next=%2Fadmin%2Fapps%2Fnew',
  );

  const page = await admin.request('/admin');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<h1>Admin<\/h1>/);
});

test('adding someone makes an invite that signs them in', async () => {
  const response = await admin.request('/admin/people', {
    form: [
      ['name', 'Lin'],
      ['groups', 'family'],
      ['groups', 'friends'],
      ['groups', 'no-such-group'],
      ['days', '30'],
    ],
  });
  assert.equal(response.status, 200);
  const url = linkIn(await response.text());
  assert.ok(url?.includes('/invite/'));
  const lin = named('Lin');
  assert.deepEqual([...lin.groups].sort(), ['family', 'friends']);

  const browser = new Browser(service.issuer);
  assert.equal((await browser.request(url!, { form: {} })).headers.get('location'), '/welcome');
  const overview = await (await admin.request('/admin')).text();
  assert.match(overview, /Lin used an invite link/);
  assert.match(overview, /Lin was given an invite link/);
});

test('an administrator gets a passkey setup link, never an invite', async () => {
  const response = await admin.request('/admin/people', {
    form: [
      ['name', 'Bo'],
      ['groups', 'admin'],
    ],
  });
  assert.ok(linkIn(await response.text())?.includes('/setup/'));
  const bo = named('Bo');
  const refused = await admin.request(`/admin/people/${bo.id}/link`, {
    form: { kind: 'invite', days: '7' },
  });
  assert.equal(refused.status, 400);
  const setup = await admin.request(`/admin/people/${bo.id}/link`, {
    form: { kind: 'setup', days: '1' },
  });
  assert.ok(linkIn(await setup.text())?.includes('/setup/'));
});

test('no one can lock themself out', async () => {
  assert.equal((await admin.request(`/admin/people/${alicia.id}/off`, { form: {} })).status, 400);
  assert.equal(
    (await admin.request(`/admin/people/${alicia.id}/delete`, { form: { sure: 'on' } })).status,
    400,
  );
  const saved = await admin.request(`/admin/people/${alicia.id}`, {
    form: [
      ['name', 'Alicia'],
      ['email', ''],
      ['groups', 'family'],
    ],
  });
  assert.equal(saved.status, 303);
  assert.deepEqual([...findPerson(service.auth.db, alicia.id)!.groups].sort(), ['admin', 'family']);
});

test('a person can be renamed, given an email, and deleted', async () => {
  const yu = addPerson(service.auth, 'Yu', ['friends']);
  const bad = await admin.request(`/admin/people/${yu.id}`, {
    form: { name: 'Yu', email: 'not mail' },
  });
  assert.equal(bad.status, 400);
  await admin.request(`/admin/people/${yu.id}`, {
    form: [
      ['name', 'Yu Ming'],
      ['email', 'yu@example.com'],
      ['groups', 'family'],
    ],
  });
  const changed = findPerson(service.auth.db, yu.id)!;
  assert.equal(changed.name, 'Yu Ming');
  assert.equal(changed.email, 'yu@example.com');
  assert.deepEqual(changed.groups, ['family']);
  const gone = await admin.request(`/admin/people/${yu.id}/delete`, { form: { sure: 'on' } });
  assert.equal(gone.headers.get('location'), '/admin');
  assert.equal(findPerson(service.auth.db, yu.id), undefined);
});

test('groups can be added and deleted, except admin', async () => {
  const added = await admin.request('/admin/groups', {
    form: { name: 'neighbours', label: 'Neighbours' },
  });
  assert.equal(added.status, 303);
  assert.ok(listGroups(service.auth.db).some((group) => group.name === 'neighbours'));
  for (const name of ['Bad Name', '9lives', '', 'a'.repeat(33)]) {
    assert.equal(
      (await admin.request('/admin/groups', { form: { name, label: 'X' } })).status,
      400,
      name,
    );
  }
  assert.equal(
    (await admin.request('/admin/groups', { form: { name: 'neighbours', label: 'Again' } })).status,
    400,
  );
  assert.equal((await admin.request('/admin/groups/admin/delete', { form: {} })).status, 400);
  await admin.request('/admin/groups/neighbours/delete', { form: {} });
  assert.ok(!listGroups(service.auth.db).some((group) => group.name === 'neighbours'));
});

/** What the token endpoint says to a client secret: invalid_grant means the secret passed. */
async function secretCheck(secret: string) {
  const response = await fetch(`${service.issuer}/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`blog:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: 'made-up',
      redirect_uri: 'https://nymphilia.com/api/auth/callback',
      code_verifier: 'v'.repeat(43),
    }),
  });
  return ((await response.json()) as { error: string }).error;
}

test('registering an app shows its secret once; a new one replaces it', async () => {
  const response = await admin.request('/admin/apps', {
    form: {
      id: 'blog',
      name: 'nymphilia.com',
      redirect_uris: 'https://nymphilia.com/api/auth/callback',
      post_logout_redirect_uris: 'https://nymphilia.com/',
      backchannel_logout_uri: 'https://nymphilia.com/api/auth/backchannel-logout',
      confidential: 'on',
      refresh: 'on',
    },
  });
  assert.equal(response.status, 200);
  const first = /value="([\w-]{43})" aria-label="Client secret"/.exec(await response.text())?.[1];
  assert.ok(first);
  assert.equal(await secretCheck(first), 'invalid_grant');
  assert.doesNotMatch(await (await admin.request('/admin/apps/blog')).text(), new RegExp(first));

  const renewed = await (await admin.request('/admin/apps/blog/secret', { form: {} })).text();
  const second = /value="([\w-]{43})" aria-label="Client secret"/.exec(renewed)?.[1];
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(await secretCheck(first), 'invalid_client');
  assert.equal(await secretCheck(second), 'invalid_grant');

  // Saving the form keeps the secret.
  const saved = await admin.request('/admin/apps/blog', {
    form: {
      name: 'The blog',
      redirect_uris: 'https://nymphilia.com/api/auth/callback',
      confidential: 'on',
    },
  });
  assert.equal(saved.headers.get('location'), '/admin/apps/blog');
  assert.equal(await secretCheck(second), 'invalid_grant');
});

test('the provider’s rules for apps are checked before an app is saved', async () => {
  const cases: [Record<string, string>, RegExp][] = [
    [{ id: 'Bad Id', name: 'X', redirect_uris: 'https://a.example/cb' }, /An app id is/],
    [{ id: 'nameless', name: '', redirect_uris: 'https://a.example/cb' }, /needs a name/],
    [{ id: 'nowhere', name: 'X', redirect_uris: 'not a url' }, /refused these settings/],
    [{ id: 'blog', name: 'X', redirect_uris: 'https://a.example/cb' }, /already an app/],
  ];
  for (const [form, message] of cases) {
    const response = await admin.request('/admin/apps', { form });
    assert.equal(response.status, 400, JSON.stringify(form));
    assert.match(await response.text(), message);
  }
});

test('deleting an app removes it from the provider', async () => {
  await admin.request('/admin/apps', {
    form: {
      id: 'gone',
      name: 'Gone',
      redirect_uris: 'https://gone.example/cb',
      confidential: 'on',
    },
  });
  assert.equal(
    (await admin.request('/admin/apps/gone/delete', { form: { sure: 'on' } })).status,
    303,
  );
  const response = await new Browser(service.issuer).request(
    '/auth?client_id=gone&response_type=code&scope=openid&redirect_uri=https%3A%2F%2Fgone.example%2Fcb',
  );
  assert.equal(response.status, 400);
});
