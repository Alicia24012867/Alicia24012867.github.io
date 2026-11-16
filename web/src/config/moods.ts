// The homepage mood card follows the visitor's local time: day from 6:00, evening
// from 17:00 and night from 20:00. Each part of the day shows one of its lines,
// and the choice changes every day. Keep lines to 32 characters or fewer so the
// card keeps its size.
export const moods = {
  day: {
    label: "TODAY'S MOOD",
    lines: [
      'A little light, a wide-open sky.',
      'Clear skies and a curious mind.',
      'Soft clouds, steady steps.',
      'Sunlight on the keyboard.',
      'Blue above, new ideas below.',
      'One small question at a time.',
    ],
  },
  evening: {
    label: "TODAY'S MOOD",
    lines: [
      'Golden hour, slower thoughts.',
      'The sky blushes; code compiles.',
      'Warm light on a quiet desk.',
      'Peach skies and a cup of tea.',
    ],
  },
  night: {
    label: "TONIGHT'S MOOD",
    lines: [
      'Quiet stars, a glowing screen.',
      'The moon is up, and so am I.',
      'Soft night, one more idea.',
      'Stars out, thoughts unwinding.',
    ],
  },
};
