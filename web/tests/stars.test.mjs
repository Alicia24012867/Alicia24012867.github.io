import test from 'node:test';
import assert from 'node:assert/strict';
import { starFlight, starKeyframes } from '../src/home/shootingStar.ts';

const motion = ({ transform }) => {
  const [, x, y, rotate, stretch] = transform
    .match(/^translate\(([-\d.e]+)px, ([-\d.e]+)px\) rotate\(([-\d.e]+)deg\) scaleX\(([\d.]+)\)$/)
    .map(Number);
  return { x, y, rotate, stretch };
};

test('whole streaks start left of the face and cross at most about half the sky', () => {
  for (const width of [320, 390, 800, 1280, 1920])
    for (const value of [0, 0.5, 0.999]) {
      const flight = starFlight(width, 656, () => value);
      assert.ok(flight.x >= 0.2 * width, `${width}: x ${flight.x}`);
      // The face sits near 66% of the width; the tail starts behind the head.
      assert.ok(
        flight.x + flight.length <= 0.6 * width,
        `${width}: tail ${flight.x + flight.length}`,
      );
      assert.ok(flight.y >= 0.03 * 656 && flight.y < 0.28 * 656, `y ${flight.y}`);
      assert.ok(flight.angle >= 15 && flight.angle <= 32);
      assert.ok(flight.distance <= 0.55 * width);
      assert.ok(flight.length <= 160 && flight.duration >= 900 && flight.duration <= 1400);
    }
  // A tap on the sky is where the star begins.
  const tapped = starFlight(1280, 656, () => 0.5, { x: 900, y: 200 });
  assert.equal(tapped.x, 900);
  assert.equal(tapped.y, 200);
});

test('the head leads: stars travel left and down with the tail behind them', () => {
  for (const value of [0, 0.5, 0.999]) {
    const flight = starFlight(1280, 656, () => value);
    const frames = starKeyframes(flight);
    const start = motion(frames[0]);
    const end = motion(frames.at(-1));
    assert.ok(end.x < start.x && end.y > start.y);
    assert.deepEqual([start.x, start.y], [flight.x, flight.y]);
    const travel = Math.hypot(end.x - start.x, end.y - start.y);
    assert.ok(Math.abs(travel - flight.distance) < 1e-6);
    // The head sits at the streak's left end; rotate() must point that end where it flies.
    const radians = (start.rotate * Math.PI) / 180;
    const head = [-Math.cos(radians), -Math.sin(radians)];
    const along = [(end.x - start.x) / travel, (end.y - start.y) / travel];
    assert.ok(head[0] * along[0] + head[1] * along[1] > 0.9999);
    assert.deepEqual(
      frames.map((frame) => frame.opacity),
      [0, 1, 0],
    );
    assert.ok(frames.every((frame) => motion(frame).rotate === start.rotate));
  }
});
