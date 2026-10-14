import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRepo, postDay, repoActivity, repoLabel, timeAgo } from '../src/home/activity.ts';

const repo = (name, extra = {}) => ({
  name,
  html_url: `https://github.com/Alicia/${name}`,
  pushed_at: '2026-10-14T10:20:01Z',
  description: `${name} notes`,
  fork: false,
  archived: false,
  private: false,
  ...extra,
});

test('the latest repository skips forks, archives and the profile README repository', () => {
  const repos = [
    repo('Alicia'),
    repo('borrowed', { fork: true }),
    repo('retired', { archived: true }),
    repo('hidden', { private: true }),
    repo('broken', { html_url: 'javascript:alert(1)' }),
    repo('undated', { pushed_at: 'soon' }),
    repo('Signals-Systems', { description: null }),
    repo('older'),
  ];
  assert.deepEqual(latestRepo(repos, 'alicia'), {
    name: 'Signals-Systems',
    url: 'https://github.com/Alicia/Signals-Systems',
    pushedAt: '2026-10-14T10:20:01Z',
    description: '',
  });
  for (const answer of [undefined, null, {}, { message: 'API rate limit exceeded' }, [], [null, 3]])
    assert.equal(latestRepo(answer, 'Alicia'), undefined);
});

test('stored activity is checked again before it becomes a link', () => {
  const stored = {
    name: 'Alicia.github.io',
    url: 'https://github.com/Alicia/Alicia.github.io',
    pushedAt: '2026-10-14T10:20:01Z',
    description: 'personal web page.',
  };
  assert.deepEqual(repoActivity(stored), stored);
  assert.deepEqual(repoActivity({ ...stored, description: undefined }), {
    ...stored,
    description: '',
  });
  for (const broken of [
    null,
    'Alicia.github.io',
    { ...stored, name: '' },
    { ...stored, url: 'https://example.com/Alicia' },
    { ...stored, url: 'javascript:alert(1)' },
    { ...stored, pushedAt: 'yesterday' },
  ])
    assert.equal(repoActivity(broken), undefined);
  assert.equal(repoLabel('Alicia.GitHub.io', 'alicia'), 'This website');
  assert.equal(repoLabel('Signals-Systems', 'Alicia'), 'Signals-Systems');
});

test('push times read as short relative English', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  for (const [elapsed, text] of [
    [-5 * minute, 'just now'],
    [0, 'just now'],
    [59_999, 'just now'],
    [minute, '1 min ago'],
    [59 * minute, '59 min ago'],
    [hour, '1 hour ago'],
    [23 * hour, '23 hours ago'],
    [day, 'yesterday'],
    [2 * day, '2 days ago'],
    [7 * day, 'last week'],
    [20 * day, '2 weeks ago'],
    [30 * day, 'last month'],
    [200 * day, '6 months ago'],
    [365 * day, 'last year'],
    [800 * day, '2 years ago'],
  ])
    assert.equal(timeAgo(now - elapsed, now), text, String(elapsed));
});

test('post days show the year only when it is not the current one', () => {
  const now = new Date(2026, 9, 14);
  assert.equal(postDay('2026-10-03', now), 'Oct 3');
  assert.equal(postDay('2026-10-03T23:30:00+08:00', now), 'Oct 3');
  assert.equal(postDay('2025-12-31', now), 'Dec 31, 2025');
});
