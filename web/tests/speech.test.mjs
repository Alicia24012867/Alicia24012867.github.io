import test from 'node:test';
import assert from 'node:assert/strict';
import { sentencesOf, spokenTex, voiceFor } from '../src/content/reader/speech.ts';

const voice = (name, lang, { local = true, isDefault = false } = {}) => ({
  name,
  lang,
  localService: local,
  default: isDefault,
});
// As Chrome lists them on a Mac: the system voice first, then the rest by name.
const mac = [
  voice('Samantha', 'en-US', { isDefault: true }),
  voice('Albert', 'en-US'),
  voice('Bad News', 'en-US'),
  voice('Daniel', 'en-GB'),
  voice('Eddy (Chinese (China mainland))', 'zh-CN'),
  voice('Eddy (English (United States))', 'en-US'),
  voice('Grandpa (Chinese (China mainland))', 'zh-CN'),
  voice('Meijia', 'zh-TW'),
  voice('Sinji', 'zh-HK'),
  voice('Tingting', 'zh-CN'),
  voice('Google US English', 'en-US', { local: false }),
  voice('Google 普通话（中国大陆）', 'zh-CN', { local: false }),
  voice('Google 粤語（香港）', 'zh-HK', { local: false }),
];
const name = (found) => found?.name;

test('a document is read by a real voice of its language, not a novelty or robotic one', () => {
  assert.equal(name(voiceFor(mac, 'en', ['en-US'])), 'Samantha');
  assert.equal(name(voiceFor(mac, 'zh-CN', ['zh-CN'])), 'Tingting');
  // Mandarin is not read in Cantonese, nor Cantonese in Mandarin.
  assert.equal(
    name(
      voiceFor(
        mac.filter((v) => v.name !== 'Tingting'),
        'zh-CN',
      ),
    ),
    'Google 普通话（中国大陆）',
  );
  assert.equal(name(voiceFor(mac, 'zh-HK')), 'Sinji');
  assert.equal(name(voiceFor([voice('Sinji', 'yue-HK')], 'zh-CN')), undefined);
  assert.equal(name(voiceFor([voice('Sinji', 'yue-HK')], 'zh-HK')), 'Sinji');
  // A robotic voice still reads when it is the only one.
  assert.equal(
    name(voiceFor([voice('Eddy (Chinese (China mainland))', 'zh-CN')], 'zh-CN')),
    'Eddy (Chinese (China mainland))',
  );
  assert.equal(
    name(voiceFor([voice('Bad News', 'en-US'), voice('Whisper', 'en-US')], 'en')),
    undefined,
  );
  assert.equal(name(voiceFor(mac, 'fr')), undefined);
  assert.equal(name(voiceFor([], 'en')), undefined);
});

test('fuller voices come first, then the system voice, then the region and the device', () => {
  const windows = [
    voice('Microsoft David - English (United States)', 'en-US', { isDefault: true }),
    voice('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN'),
    voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US', { local: false }),
    voice('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'zh-CN', { local: false }),
  ];
  assert.equal(
    name(voiceFor(windows, 'en')),
    'Microsoft Aria Online (Natural) - English (United States)',
  );
  assert.equal(
    name(voiceFor(windows, 'zh-CN')),
    'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
  );
  assert.equal(
    name(voiceFor([...mac, voice('Tingting (Enhanced)', 'zh-CN')], 'zh-CN')),
    'Tingting (Enhanced)',
  );
  // English is read in the reader's own English, else in American English.
  const english = [voice('Karen', 'en-AU'), voice('Daniel', 'en-GB'), voice('Alex', 'en-US')];
  assert.equal(name(voiceFor(english, 'en', ['en-GB', 'en'])), 'Daniel');
  assert.equal(name(voiceFor(english, 'en', ['zh-CN'])), 'Alex');
  // Android writes tags with underscores, and some systems tag Mandarin `cmn`.
  assert.equal(name(voiceFor([voice('Chinese', 'cmn_CN')], 'zh-CN')), 'Chinese');
  assert.equal(name(voiceFor([voice('English', 'en_US')], 'en')), 'English');
});

const read = (text, lang, limit) =>
  sentencesOf(text, lang, limit).map(({ from, to }) => text.slice(from, to));

test('text is read a sentence at a time, without the spaces between', () => {
  assert.deepEqual(read('The sky is blue today.  A value of 0.9 is fine! Is it? Yes. ', 'en'), [
    'The sky is blue today.',
    'A value of 0.9 is fine!',
    'Is it?',
    'Yes.',
  ]);
  assert.deepEqual(read('现在是10月2日，星期五。后来下起了雨！真的吗？', 'zh-CN'), [
    '现在是10月2日，星期五。',
    '后来下起了雨！',
    '真的吗？',
  ]);
  // A bracket left open at the end of one sentence opens the next.
  assert.deepEqual(read('星期五。...(以下略去原文)', 'zh-CN'), ['星期五。...', '(以下略去原文)']);
  // Nothing to say, nothing read.
  assert.deepEqual(read(' — … ', 'en'), []);
});

test('a long sentence is cut at a pause, else at a space, else where it fits', () => {
  assert.deepEqual(
    read(
      '我们沿着海边走了很久，聊起这一年遇见的人，后来下起了雨，我们躲进一家小店，直到天色暗了才回家。',
      'zh-CN',
      24,
    ),
    [
      '我们沿着海边走了很久，聊起这一年遇见的人，',
      '后来下起了雨，我们躲进一家小店，',
      '直到天色暗了才回家。',
    ],
  );
  assert.deepEqual(read('one two three four five six seven eight nine ten', 'en', 20), [
    'one two three four',
    'five six seven eight',
    'nine ten',
  ]);
  const unbroken = '𝒜'.repeat(30);
  const pieces = read(unbroken, 'en', 21);
  assert.equal(pieces.join(''), unbroken);
  // No piece splits a character outside the basic plane.
  assert.ok(
    pieces.every((piece) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(piece)),
    pieces,
  );
});

test('without Intl.Segmenter, sentences end at their final punctuation', () => {
  const segmenter = Intl.Segmenter;
  try {
    Intl.Segmenter = undefined;
    assert.deepEqual(read('It is 0.9 metres. “Really?” Yes! 好的。然后呢', 'en'), [
      'It is 0.9 metres.',
      '“Really?”',
      'Yes!',
      '好的。',
      '然后呢',
    ]);
  } finally {
    Intl.Segmenter = segmenter;
  }
});

test('a short formula is read as its symbols, one with structure not at all', () => {
  assert.equal(spokenTex('h_n = h_n/8'), 'h n = h n/8');
  assert.equal(spokenTex('h_n \\le 0.9 \\times h_n^p'), 'h n ≤ 0.9 × h n p');
  assert.equal(
    spokenTex('h_{n+1} = C \\alpha h_n, C \\in (0.8,0.9)'),
    'h n+1 = C α h n, C ∈ (0.8,0.9)',
  );
  assert.equal(spokenTex('O(h^3) / h = O(h^{2})'), 'O(h³) / h = O(h²)');
  assert.equal(spokenTex('t = 5\\,\\text{ms}'), 't = 5 ms');
  assert.equal(spokenTex('\\left( a \\right)'), '( a )');
  assert.equal(spokenTex('\\frac{a}{b}'), undefined);
  assert.equal(spokenTex('\\sqrt{2}'), undefined);
  assert.equal(spokenTex('x'.repeat(61)), undefined);
  assert.equal(spokenTex('{}'), undefined);
});
