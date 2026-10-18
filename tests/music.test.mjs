import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { audioTypes, findTracks, musicPlugin } from '../scripts/music.mjs';
import { resumePoint, startAt, writtenMusic } from '../src/components/music/place.ts';
import { musicKey, pieceTitle, playableTracks, readMusic } from '../src/components/music/tracks.ts';

const folder = (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-music-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const touch = (directory, ...names) => {
  for (const name of names) writeFileSync(path.join(directory, name), '');
};
const names = (tracks) => tracks.map(({ name }) => name);

test('a missing or empty music folder has no pieces', (t) => {
  const root = folder(t);
  assert.deepEqual(findTracks(path.join(root, 'missing')), []);
  assert.deepEqual(findTracks(root), []);
});

test('only audio files are pieces: not pictures, notes, hidden files or subfolders', (t) => {
  const root = folder(t);
  touch(root, 'cover.jpg', 'notes.txt', '.gitkeep', '.hidden.mp3', '.mp3', 'README', 'song.MP3');
  mkdirSync(path.join(root, 'album.mp3'));
  mkdirSync(path.join(root, 'drafts'));
  touch(path.join(root, 'drafts'), 'draft.mp3');
  assert.deepEqual(findTracks(root), [
    { name: 'song', sources: [{ src: '/audio/song.MP3', type: 'audio/mpeg' }] },
  ]);
});

test('pieces sort by file name as people read it: numbers by value, Chinese by pinyin', (t) => {
  const root = folder(t);
  touch(root, 'Zebra.mp3', '10 夜曲.mp3', '2 晨光.mp3', '1 序.mp3', '暮色.mp3', '安静.mp3');
  touch(root, 'b song.mp3', 'A song.mp3');
  assert.deepEqual(names(findTracks(root)), [
    '1 序',
    '2 晨光',
    '10 夜曲',
    '安静',
    '暮色',
    'A song',
    'b song',
    'Zebra',
  ]);
  // Names that read the same still come in one order, whatever order the folder lists them in.
  touch(root, '01 one.mp3', '1 one.mp3');
  assert.deepEqual(names(findTracks(root)).slice(0, 3), ['1 序', '01 one', '1 one']);
});

test('one piece in several formats is offered in the order browsers play best', (t) => {
  const root = folder(t);
  touch(root, 'piece.wav', 'piece.mp3', 'piece.flac', 'piece.ogg', 'piece.m4a', 'piece.opus');
  touch(root, 'other.mp3');
  const tracks = findTracks(root);
  assert.deepEqual(names(tracks), ['other', 'piece']);
  assert.deepEqual(
    tracks[1].sources.map(({ src }) => path.extname(src)),
    ['.opus', '.m4a', '.ogg', '.mp3', '.flac', '.wav'],
  );
  assert.deepEqual(tracks[1].sources[0], { src: '/audio/piece.opus', type: audioTypes['.opus'] });
});

test('file names become addresses the browser can fetch', (t) => {
  const root = folder(t);
  touch(root, '01 晨光 #1?.mp3');
  assert.deepEqual(findTracks(root, '/site/audio/')[0], {
    name: '01 晨光 #1?',
    sources: [{ src: '/site/audio/01%20%E6%99%A8%E5%85%89%20%231%3F.mp3', type: 'audio/mpeg' }],
  });
});

test('the development server lists the music and reloads when a piece is added or removed', async (t) => {
  const root = folder(t);
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [musicPlugin()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const reloads = [];
  server.ws.send = (payload) => reloads.push(payload.type);
  try {
    assert.match((await server.transformRequest('virtual:music')).code, /const tracks = \[\]/);
    const audio = path.join(root, 'public/audio');
    mkdirSync(audio, { recursive: true });
    const file = path.join(audio, 'first.mp3');
    touch(audio, 'first.mp3');
    server.watcher.emit('add', file);
    assert.match((await server.transformRequest('virtual:music')).code, /\/audio\/first\.mp3/);
    // Files elsewhere leave the music alone.
    server.watcher.emit('add', path.join(root, 'public/first.mp3'));
    assert.deepEqual(reloads, ['full-reload']);
    rmSync(file);
    server.watcher.emit('unlink', file);
    assert.match((await server.transformRequest('virtual:music')).code, /const tracks = \[\]/);
    assert.deepEqual(reloads, ['full-reload', 'full-reload']);
  } finally {
    await server.close();
  }
});

const track = (name, ...types) => ({
  name,
  sources: types.map((type) => ({ src: `/audio/${name}`, type })),
});

test('a browser is offered only the pieces and formats it can play', () => {
  const tracks = [
    track('a', 'audio/ogg; codecs=opus', 'audio/mpeg'),
    track('b', 'audio/flac'),
    track('c', 'audio/mpeg'),
  ];
  const playable = playableTracks(tracks, (type) => type === 'audio/mpeg');
  assert.deepEqual(names(playable), ['a', 'c']);
  assert.deepEqual(playable[0].sources, [{ src: '/audio/a', type: 'audio/mpeg' }]);
  // The list from the build is left as it was.
  assert.equal(tracks[0].sources.length, 2);
  assert.deepEqual(
    playableTracks(tracks, () => false),
    [],
  );
});

test('the kept music survives a round trip, its time to a tenth of a second', () => {
  const kept = { on: true, track: '02 晨光', time: 83.4567, owner: 'page' };
  assert.equal(musicKey, 'alicia-music');
  assert.deepEqual(readMusic(writtenMusic(kept)), { ...kept, time: 83.4 });
  assert.deepEqual(readMusic(writtenMusic({ on: false })), { on: false });
  assert.deepEqual(readMusic(writtenMusic({ on: true, track: 'a', time: 0 })), {
    on: true,
    track: 'a',
    time: 0,
  });
  // A time means nothing without its piece.
  assert.deepEqual(readMusic(writtenMusic({ on: true, time: 12 })), { on: true });
});

test('missing or broken kept music counts as off, from the beginning', () => {
  for (const broken of [null, '', '{', '[]', '"on"', '42', 'null', '{"on":"true"}'])
    assert.deepEqual(readMusic(broken), { on: false }, String(broken));
  assert.deepEqual(readMusic(JSON.stringify({ on: true, track: 7, time: 12, owner: '' })), {
    on: true,
  });
  for (const time of ['-1', '"soon"', 'null', '1e400'])
    assert.deepEqual(
      readMusic(`{"on":true,"track":"a","time":${time}}`),
      { on: true, track: 'a' },
      time,
    );
});

test('the music goes on from the kept place, or from the first piece', () => {
  const tracks = [track('a'), track('b'), track('c')];
  assert.deepEqual(resumePoint(tracks, { on: true, track: 'b', time: 42.5 }), {
    index: 1,
    time: 42.5,
  });
  assert.deepEqual(resumePoint(tracks, { on: true, track: 'c' }), { index: 2, time: 0 });
  // A piece since taken out of the folder, or none yet, starts the list again.
  assert.deepEqual(resumePoint(tracks, { on: true, track: 'gone', time: 9 }), {
    index: 0,
    time: 0,
  });
  assert.deepEqual(resumePoint(tracks, { on: false }), { index: 0, time: 0 });
  // With nothing kept, the music begins at the piece picked for it.
  assert.deepEqual(resumePoint(tracks, { on: false }, 2), { index: 2, time: 0 });
  assert.deepEqual(resumePoint(tracks, { on: true, track: 'gone', time: 9 }, 1), {
    index: 1,
    time: 0,
  });
  assert.deepEqual(resumePoint(tracks, { on: true, track: 'a', time: 3 }, 2), {
    index: 0,
    time: 3,
  });
});

test('a piece is shown without the number that sets its place in the list', () => {
  assert.equal(pieceTitle('01 花月夜 - Flowery Moonlit Night'), '花月夜 - Flowery Moonlit Night');
  assert.equal(pieceTitle('2. Dawn'), 'Dawn');
  assert.equal(pieceTitle('10 - 夜曲'), '夜曲');
  assert.equal(pieceTitle('天門 - Solitude'), '天門 - Solitude');
  // A name that is only a number, or begins with one that belongs to it, stays as it is.
  assert.equal(pieceTitle('1984'), '1984');
  assert.equal(pieceTitle('99 '), '99 ');
  assert.equal(pieceTitle('7th Heaven'), '7th Heaven');
});

test('a kept place at the very end of a piece moves on to the next', () => {
  assert.equal(startAt(42.5, 180), 42.5);
  assert.equal(startAt(0, 180), 0);
  assert.equal(startAt(179.5, 180), -1);
  assert.equal(startAt(200, 180), -1);
  // Until the length is known, the kept place stands.
  assert.equal(startAt(42.5, NaN), 42.5);
  assert.equal(startAt(42.5, Infinity), 42.5);
});
