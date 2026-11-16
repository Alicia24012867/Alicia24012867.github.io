import test from 'node:test';
import assert from 'node:assert/strict';
import { moods } from '../src/config/moods.ts';
import { nextSkyChange, skyMood, skyPeriod } from '../src/home/skyMood.ts';

// A zone with daylight saving time. Dates below are local times in this zone.
process.env.TZ = 'America/New_York';

const lineIndex = (date) => moods[skyPeriod(date)].lines.indexOf(skyMood(date).line);

test('the mood follows the local hour: day from 6:00, evening from 17:00, night from 20:00', () => {
  for (const [hour, minute, period] of [
    [0, 0, 'night'],
    [5, 59, 'night'],
    [6, 0, 'day'],
    [16, 59, 'day'],
    [17, 0, 'evening'],
    [19, 59, 'evening'],
    [20, 0, 'night'],
    [23, 59, 'night'],
  ]) {
    const mood = skyMood(new Date(2026, 9, 14, hour, minute));
    assert.equal(mood.period, period, `${hour}:${minute}`);
    assert.equal(mood.label, moods[period].label);
    assert.ok(moods[period].lines.includes(mood.line));
  }
  assert.equal(skyMood(new Date(2026, 9, 14, 12)).icon, 'sun');
  assert.equal(skyMood(new Date(2026, 9, 14, 18)).icon, 'sunset');
  assert.equal(skyMood(new Date(2026, 9, 14, 22)).icon, 'moon');
});

test('each part of the day changes its line daily', (t) => {
  t.after(() => (process.env.TZ = 'America/New_York'));
  // Consecutive days step through each list, including the daylight saving changes of
  // zones whose local midnight crosses a UTC date boundary when clocks change.
  for (const zone of ['America/New_York', 'Europe/London', 'Asia/Shanghai']) {
    process.env.TZ = zone;
    for (const [period, hour] of [
      ['day', 12],
      ['evening', 18],
      ['night', 22],
    ]) {
      const count = moods[period].lines.length;
      for (const [month, first] of [
        [2, 1],
        [9, 20],
      ]) {
        for (let day = first; day < first + 16; day++) {
          const today = lineIndex(new Date(2026, month, day, hour));
          const tomorrow = lineIndex(new Date(2026, month, day + 1, hour));
          assert.equal(tomorrow, (today + 1) % count, `${zone} ${period} ${month + 1}/${day}`);
        }
      }
    }
  }
});

test('a night keeps its line past midnight and changes it at 6:00', () => {
  for (const evening of [new Date(2026, 9, 14, 20), new Date(2026, 2, 7, 23)]) {
    const night = skyMood(evening);
    for (const hour of [0, 3, 5]) {
      const after = new Date(
        evening.getFullYear(),
        evening.getMonth(),
        evening.getDate() + 1,
        hour,
      );
      assert.equal(skyMood(after).line, night.line, after.toString());
    }
  }
  assert.notEqual(
    skyMood(new Date(2026, 9, 15, 5, 59)).line,
    skyMood(new Date(2026, 9, 15, 20)).line,
  );
});

test('the next change is the next local boundary, also on daylight saving days', () => {
  for (const [from, to] of [
    [new Date(2026, 9, 14, 0, 0), new Date(2026, 9, 14, 6)],
    [new Date(2026, 9, 14, 5, 59, 59), new Date(2026, 9, 14, 6)],
    [new Date(2026, 9, 14, 6), new Date(2026, 9, 14, 17)],
    [new Date(2026, 9, 14, 19, 59), new Date(2026, 9, 14, 20)],
    [new Date(2026, 9, 14, 20), new Date(2026, 9, 15, 6)],
    [new Date(2026, 9, 14, 23, 30), new Date(2026, 9, 15, 6)],
    [new Date(2026, 11, 31, 22), new Date(2027, 0, 1, 6)],
    // Clocks skip from 2:00 to 3:00, and later repeat 1:00 to 2:00.
    [new Date(2026, 2, 8, 1), new Date(2026, 2, 8, 6)],
    [new Date(2026, 10, 1, 1, 30), new Date(2026, 10, 1, 6)],
  ]) {
    assert.equal(nextSkyChange(from).getTime(), to.getTime(), from.toString());
    assert.notEqual(skyMood(new Date(to.getTime() - 1)).period, skyMood(to).period);
  }
  assert.equal(new Date(2026, 2, 8, 6) - new Date(2026, 2, 8, 1), 4 * 3_600_000);
});

test('mood lines fit the card', () => {
  for (const [period, { label, lines }] of Object.entries(moods)) {
    assert.equal(label, label.toUpperCase(), period);
    assert.ok(lines.length > 0, period);
    assert.equal(new Set(lines).size, lines.length, `${period} repeats a line`);
    for (const line of lines) {
      assert.equal(line, line.trim());
      assert.ok(line.length > 0 && line.length <= 32, `${period}: ${line}`);
    }
  }
});
